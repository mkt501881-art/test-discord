require("dotenv").config()

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js")
const fetch = require("node-fetch")
const express = require("express")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json())

// ===== 設定 =====
const TOKEN = process.env.DISCORD_TOKEN
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const CLIENT_ID = process.env.CLIENT_ID

const REPO = "mkt501881-art/status"
const FILE_PATH = "status.json"

// ✅ チャンネル
const REQUEST_CHANNEL_ID = "1502851078700535869"
const LOG_CHANNEL_ID = "1503222413096128633"

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

// ===== ✅ ログ関数 =====
async function sendLog(message) {
  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID)
    await channel.send({ content: message })
  } catch (err) {
    console.error(err)
  }
}

// ===== Slashコマンド（そのまま）=====
const commands = [
  new SlashCommandBuilder()
    .setName("set")
    .setDescription("ステータス更新")
    .addStringOption(o => o.setName("name").setDescription("文庫名").setRequired(true))
    .addStringOption(o =>
      o.setName("status").setDescription("状態").setRequired(true)
      .addChoices(
        { name: "貸し出し可能", value: "available" },
        { name: "貸し出し中", value: "using" }
      )
    )
    .addStringOption(o => o.setName("location").setDescription("保管場所"))
    .addStringOption(o => o.setName("owner").setDescription("出品者"))
    .addStringOption(o =>
      o.setName("genre").setDescription("ジャンル")
       .addChoices(
         { name: "マンガ", value: "マンガ" },
         { name: "ライトノベル", value: "ライトノベル" },
         { name: "小説", value: "小説" },
         { name: "その他", value: "その他" }
       )
    ),

  new SlashCommandBuilder()
    .setName("add")
    .setDescription("本を追加")
    .addStringOption(o => o.setName("name").setDescription("本の名前").setRequired(true))
    .addStringOption(o =>
      o.setName("genre").setDescription("ジャンル").setRequired(true)
       .addChoices(
         { name: "マンガ", value: "マンガ" },
         { name: "ライトノベル", value: "ライトノベル" },
         { name: "小説", value: "小説" },
         { name: "その他", value: "その他" }
       )
    )
    .addStringOption(o => o.setName("location").setDescription("保管場所").setRequired(true))
    .addStringOption(o => o.setName("owner").setDescription("出品者").setRequired(true)),

  new SlashCommandBuilder()
    .setName("delete")
    .setDescription("本を削除")
    .addStringOption(o =>
      o.setName("name").setDescription("削除する本の名前").setRequired(true)
    )

].map(c => c.toJSON())

const rest = new REST({ version: "10" }).setToken(TOKEN)

async function registerCommands() {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`)
  registerCommands()
})

function checkRole(interaction) {
  const allowedRoleId = "1502839785834811422"
  return interaction.member.roles.cache.has(allowedRoleId)
}

// ===== add（borrower追加だけ変更）=====
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  if (!checkRole(interaction)) {
    return interaction.reply({ content: "権限なし", ephemeral: true })
  }

  if (interaction.commandName === "add") {
    const name = interaction.options.getString("name")
    const genre = interaction.options.getString("genre")
    const location = interaction.options.getString("location")
    const owner = interaction.options.getString("owner")

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
      borrower: null // ✅ここだけ追加
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

    await interaction.reply("追加完了")
    await sendLog(`➕ ${name}`)
  }
})


// ===== 🔥 申請 =====
app.post("/request", async (req, res) => {
  const { name, user, studentName } = req.body

  const resGit = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  })

  const data = await resGit.json()
  const content = JSON.parse(Buffer.from(data.content, "base64").toString())

  const updated = content.map(item => {
    if (item.name === name) {
      return {
        ...item,
        status: "pending",
        borrower: {
          email: user,
          name: studentName,
          className: className
        }
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
      message: `request ${name}`,
      content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
      sha: data.sha
    })
  })

  const ch = await client.channels.fetch(REQUEST_CHANNEL_ID)
await channel.send({
  embeds: [{
    title: `📦 ${name}`,
    description: "貸し出し申請",
    color: 0x00cc66,

    fields: [
      {
        name: "利用者",
        value: `${studentName}（${className} ${number}）`
      },
      {
        name: "メール",
        value: user
      },
      {
        name: "出品者 / 保管場所",
        value: `${owner} / ${location}`
      }
    ],

    footer: {
      text: new Date().toLocaleString("ja-JP")
    }
  }]
})

  await sendLog(`申請 ${name} | ${studentName} ${className}`)

  res.json({ ok: true })
})


// ===== 🔥 取消 =====
app.post("/cancel", async (req, res) => {
  const { name, user } = req.body

  const resGit = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  })

  const data = await resGit.json()
  const content = JSON.parse(Buffer.from(data.content, "base64").toString())

  let studentName = ""

  const updated = content.map(item => {
    if (item.name === name && item.borrower?.email === user) {
      studentName = item.borrower?.name || ""
      const className = item.borrower?.className || ""
      return {
        ...item,
        status: "available",
        borrower: null
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
      message: `cancel ${name}`,
      content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
      sha: data.sha
    })
  })

  // ✅ 詳細通知
  const ch = await client.channels.fetch(REQUEST_CHANNEL_ID)
  await ch.send(`↩取消: ${name} / ${studentName}`)

  // ✅ ログ
  await sendLog(`申請撤回 ${name} | ${studentName} ${className}`)

  res.json({ ok: true })
})


app.listen(3000)
client.login(TOKEN)
