require("dotenv").config()

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js")
const fetch = require("node-fetch")
const express = require("express")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json())

const TOKEN = process.env.DISCORD_TOKEN
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const CLIENT_ID = process.env.CLIENT_ID

const REPO = "mkt501881-art/status"
const FILE_PATH = "status.json"

const REQUEST_CHANNEL_ID = "1502851078700535869"
const LOG_CHANNEL_ID = "1503222413096128633"

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

// ✅ ログ
async function sendLog(msg) {
  const ch = await client.channels.fetch(LOG_CHANNEL_ID)
  await ch.send(msg)
}

// ✅ 権限
function checkRole(interaction) {
  const allowedRoleId = "1502839785834811422"
  return interaction.member.roles.cache.has(allowedRoleId)
}


// ✅ Slashコマンド
const commands = [

  new SlashCommandBuilder()
    .setName("set")
    .setDescription("ステータス変更")
    .addStringOption(o => o.setName("name").setDescription("文庫名").setRequired(true))
    .addStringOption(o =>
      o.setName("status").setDescription("状態").setRequired(true)
      .addChoices(
        { name: "貸出可", value: "available" },
        { name: "貸出中", value: "using" }
      )
    ),

  new SlashCommandBuilder()
    .setName("add")
    .setDescription("本を追加")
    .addStringOption(o => o.setName("name").setDescription("文庫名").setRequired(true))
    .addStringOption(o => o.setName("genre").setDescription("ジャンル").setRequired(true))
    .addStringOption(o => o.setName("location").setDescription("保管場所").setRequired(true))
    .addStringOption(o => o.setName("owner").setDescription("出品者").setRequired(true)),

  new SlashCommandBuilder()
    .setName("delete")
    .setDescription("本を削除")
    .addStringOption(o => o.setName("name").setDescription("文庫名").setRequired(true))

].map(c => c.toJSON())

const rest = new REST({ version: "10" }).setToken(TOKEN)

client.once("ready", async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
  console.log("✅ 起動OK")
})


// ===== Slash処理 =====
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return

  if (!checkRole(i)) {
    return i.reply({ content: "❌ 権限なし", ephemeral: true })
  }

  // ===== set =====
  if (i.commandName === "set") {
    const name = i.options.getString("name")
    const status = i.options.getString("status")

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    })

    const data = await res.json()
    const content = JSON.parse(Buffer.from(data.content, "base64").toString())

    const updated = content.map(item => {
      if (item.name === name) {
        return {
          ...item,
          status // ✅ borrowerは触らない
        }
      }
      return item
    })

    await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `set ${name}`,
        content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
        sha: data.sha
      })
    })

    await i.reply("✅ 更新完了")
  }

  // ===== add =====
  if (i.commandName === "add") {
    const name = i.options.getString("name")
    const genre = i.options.getString("genre")
    const location = i.options.getString("location")
    const owner = i.options.getString("owner")

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    })

    const data = await res.json()
    const content = JSON.parse(Buffer.from(data.content, "base64").toString())

    content.push({
      name,
      status: "available",
      location,
      owner,
      genre,
      borrower: null
    })

    await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `add ${name}`,
        content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
        sha: data.sha
      })
    })

    await i.reply("✅ 追加完了")
  }

  // ===== delete =====
  if (i.commandName === "delete") {
    const name = i.options.getString("name")

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    })

    const data = await res.json()
    const content = JSON.parse(Buffer.from(data.content, "base64").toString())

    const updated = content.filter(item => item.name !== name)

    await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `delete ${name}`,
        content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
        sha: data.sha
      })
    })

    await i.reply("✅ 削除完了")
  }
})


// ===== 申請 =====
app.post("/request", async (req, res) => {
  const { name, user, className, studentName } = req.body

  try {
    const ch = await client.channels.fetch(REQUEST_CHANNEL_ID)

    await ch.send({
      embeds: [{
        title: "📦 貸し出し申請",
        description: name,
        fields: [
          { name: "利用者", value: `${studentName} ${className}` }
        ]
      }]
    })

    await sendLog(`申請 ${name} | ${studentName} ${className}`)

    // JSON更新
    const resGit = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    })

    const data = await resGit.json()
    const content = JSON.parse(Buffer.from(data.content, "base64").toString())

    const updated = content.map(item =>
      item.name === name
        ? {
            ...item,
            status: "pending",
            borrower: { email: user, name: studentName, className }
          }
        : item
    )

    await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `request ${name}`,
        content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
        sha: data.sha
      })
    })

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
  }
})


// ===== 取消 =====
app.post("/cancel", async (req, res) => {
  const { name, user } = req.body

  const resGit = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  })

  const data = await resGit.json()
  const content = JSON.parse(Buffer.from(data.content, "base64").toString())

  let studentName = ""
  let className = ""

  const updated = content.map(item => {
    if (item.name === name && item.borrower?.email === user) {
      studentName = item.borrower.name
      className = item.borrower.className
      return { ...item, status: "available", borrower: null }
    }
    return item
  })

  const ch = await client.channels.fetch(REQUEST_CHANNEL_ID)
  await ch.send(`↩ 申請取消: ${name} / ${studentName}`)

  await sendLog(`申請撤回 ${name} | ${studentName} ${className}`)

  await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `cancel ${name}`,
      content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
      sha: data.sha
    })
  })

  res.json({ ok: true })
})

app.listen(3000)
client.login(TOKEN)
