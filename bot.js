require("dotenv").config()

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js")

const fetch = require("node-fetch")
const express = require("express")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json())

const TOKEN = process.env.DISCORD_TOKEN
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const LOAN_DAYS = Number(process.env.LOAN_DAYS || 3)

const REPO = "mkt501881-art/status"
const FILE_PATH = "status.json"

const REQUEST_CHANNEL_ID = "1502851078700535869"
const LOG_CHANNEL_ID = "1503222413096128633"

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

// ===== 共通 =====
function getJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

function getDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

async function sendLog(msg) {
  const ch = await client.channels.fetch(LOG_CHANNEL_ID)
  await ch.send(msg)
}

function checkRole(i) {
  return i.member.roles.cache.has("1502839785834811422")
}

// ===== Slash =====
const commands = [
  new SlashCommandBuilder()
    .setName("add")
    .addStringOption(o=>o.setName("name").setRequired(true))
    .addStringOption(o=>o.setName("genre").setRequired(true))
    .addStringOption(o=>o.setName("location").setRequired(true))
    .addStringOption(o=>o.setName("owner").setRequired(true))
    .addStringOption(o=>o.setName("owner_id").setRequired(true)),

  new SlashCommandBuilder()
    .setName("delete")
    .addStringOption(o=>o.setName("name").setRequired(true))
].map(c => c.toJSON())

const rest = new REST({ version: "10" }).setToken(TOKEN)

client.once("ready", async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
  console.log("✅ 起動OK")
})

// ===== interaction =====
client.on("interactionCreate", async (i) => {

  if (i.isChatInputCommand()) {

    if (!checkRole(i)) {
      return i.reply({ content: "❌ 権限なし", ephemeral: true })
    }

    if (i.commandName === "add") {
      const name = i.options.getString("name")
      const genre = i.options.getString("genre")
      const location = i.options.getString("location")
      const owner = i.options.getString("owner")
      const owner_id = i.options.getString("owner_id")

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
        owner_id,
        genre,
        borrower: null,
        dueDate: null,
        pendingAt: null
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

    if (i.commandName === "delete") {
      const name = i.options.getString("name")

      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      })

      const data = await res.json()
      const content = JSON.parse(Buffer.from(data.content, "base64").toString())

      const updated = content.filter(i => i.name !== name)

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

      await i.reply("✅ 削除")
    }
  }

  // ===== ボタン =====
  if (i.isButton()) {

    const [type, name] = i.customId.split("_")

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    })

    const data = await res.json()
    const content = JSON.parse(Buffer.from(data.content, "base64").toString())

    const target = content.find(x => x.name === name)

    if (!target) return

    // ===== 承認 =====
    if (type === "approve") {

      if (String(target.owner_id) !== i.user.id)
        return i.reply({ content: "❌ 権限なし", ephemeral: true })

      const now = getJST()
      const due = new Date(now)
      due.setDate(due.getDate() + LOAN_DAYS)

      const updated = content.map(x =>
        x.name === name
          ? { ...x, status: "using", dueDate: getDateStr(due), pendingAt: null }
          : x
      )

      await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        method: "PUT",
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `approve ${name}`,
          content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
          sha: data.sha
        })
      })

      await i.update({
        content: `✅ 貸し出し中: ${name}`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`return_${name}`)
              .setLabel("返却完了")
              .setStyle(ButtonStyle.Danger)
          )
        ]
      })
    }

    // ===== 返却 =====
    if (type === "return") {

      const updated = content.map(x =>
        x.name === name
          ? { ...x, status: "available", borrower: null, dueDate: null }
          : x
      )

      await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        method: "PUT",
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `return ${name}`,
          content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
          sha: data.sha
        })
      })

      await i.update({ content: `✅ 返却完了: ${name}`, components: [] })
    }
  }
})

// ===== 申請 =====
app.post("/request", async (req, res) => {
  const { name, user, className, studentName } = req.body

  const resGit = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  })

  const data = await resGit.json()
  const content = JSON.parse(Buffer.from(data.content, "base64").toString())

  const now = getJST()

  const updated = content.map(item =>
    item.name === name
      ? {
          ...item,
          status: "pending",
          pendingAt: now.toISOString(),
          borrower: { name: studentName }
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

  const target = content.find(i => i.name === name)

  const ch = await client.channels.fetch(REQUEST_CHANNEL_ID)
  await ch.send({
    content: `<@${target.owner_id}>`,
    embeds: [{ title: "貸し出し申請", description: name }],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_${name}`)
          .setLabel("貸し出し完了")
          .setStyle(ButtonStyle.Success)
      )
    ]
  })

  res.json({ ok: true })
})

// ===== 自動処理 =====
setInterval(async () => {

  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  })

  const data = await res.json()
  const content = JSON.parse(Buffer.from(data.content, "base64").toString())

  const now = getJST()
  const today = getDateStr(now)

  let changed = false

  const updated = content.map(item => {

    // 期限通知
    if (item.status === "using" && item.dueDate === today && now.getHours() === 8) {
      client.channels.fetch(REQUEST_CHANNEL_ID).then(ch => {
        ch.send(`<@${item.owner_id}> 🔔返却期限: ${item.name}`)
      })
    }

    // pending強制解除
    if (item.status === "pending" && item.pendingAt) {
      const t = new Date(item.pendingAt)
      const limit = new Date(t)
      limit.setDate(limit.getDate() + 1)
      limit.setHours(0, 0, 0, 0)

      if (now >= limit) {
        changed = true
        return { ...item, status: "available", borrower: null, pendingAt: null }
      }
    }

    return item
  })

  if (changed) {
    await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "auto update",
        content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
        sha: data.sha
      })
    })
  }

}, 60000)

app.listen(3000)
client.login(TOKEN)
