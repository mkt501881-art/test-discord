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

async function sendLog(msg) {
  const ch = await client.channels.fetch(LOG_CHANNEL_ID)
  await ch.send(msg)
}

const commands = [
  new SlashCommandBuilder()
    .setName("add")
    .setDescription("本を追加")
    .addStringOption(o => o.setName("name").setDescription("名前").setRequired(true))
    .addStringOption(o => o.setName("genre").setDescription("ジャンル").setRequired(true))
    .addStringOption(o => o.setName("location").setDescription("場所").setRequired(true))
    .addStringOption(o => o.setName("owner").setDescription("出品者").setRequired(true)),

].map(c => c.toJSON())

const rest = new REST({ version: "10" }).setToken(TOKEN)

client.once("ready", async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
  console.log("起動OK")
})


// ===== add =====
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return

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
      borrower: null   // ✅
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

    await i.reply("追加OK")
  }
})


// ===== ✅ 申請 =====
app.post("/request", async (req, res) => {
  const { name, user, location, owner, className, number, studentName } = req.body

  try {
    // ✅ まずDiscord（絶対通す）
    const ch = await client.channels.fetch(REQUEST_CHANNEL_ID)

    await ch.send({
      embeds: [{
        title: "📦 貸し出し申請",
        description: name,
        fields: [
          { name: "名前", value: studentName },
          { name: "所属", value: `${className} ${number}` }
        ]
      }]
    })

    await sendLog(`申請 ${name} | ${studentName} ${className}`)

    // ✅ 次にJSON更新
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
            borrower: {
              email: user,
              name: studentName,
              className: className
            }
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

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})


// ===== ✅ 取消 =====
app.post("/cancel", async (req, res) => {
  const { name, user } = req.body

  try {
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
        return {
          ...item,
          status: "available",
          borrower: null
        }
      }
      return item
    })

    // ✅ Discord通知
    const ch = await client.channels.fetch(REQUEST_CHANNEL_ID)
    await ch.send(`↩ 申請取消: ${name} / ${studentName}`)

    await sendLog(`申請撤回 ${name} | ${studentName} ${className}`)

    // ✅ JSON更新
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

  } catch (err) {
    console.error(err)
  }
})


app.listen(3000)
client.login(TOKEN)
