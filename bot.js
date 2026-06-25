require("dotenv").config()

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js")
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js")
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

// ✅ JST
function getJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}
function getDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

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

// ✅ Slash（完全維持）
const commands = [
new SlashCommandBuilder()
  .setName("set")
  .setDescription("ステータス更新")
  .addStringOption(o => o.setName("name").setDescription("文庫名").setRequired(true))
  .addStringOption(o => o.setName("status").setDescription("状態")
    .addChoices(
      { name: "貸出可", value: "available" },
      { name: "貸出中", value: "using" }
    )
  )
  .addStringOption(o => o.setName("location").setDescription("保管場所"))
  .addStringOption(o => o.setName("owner").setDescription("出品者"))
  .addStringOption(o => o.setName("genre").setDescription("ジャンル")
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
  .addStringOption(o => o.setName("name").setDescription("文庫名").setRequired(true))
  .addStringOption(o => o.setName("genre").setDescription("ジャンル").setRequired(true))
  .addStringOption(o => o.setName("location").setDescription("保管場所").setRequired(true))
  .addStringOption(o => o.setName("owner").setDescription("出品者").setRequired(true))
  .addStringOption(o => o.setName("owner_id").setDescription("出品者のDiscord ID").setRequired(true)),

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

// ===== interaction（そのまま＋最小追加）=====
client.on("interactionCreate", async (i) => {

  if (i.isChatInputCommand()) {

    if (!checkRole(i)) {
      return i.reply({ content: "❌ 権限なし", ephemeral: true })
    }

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    })

    const data = await res.json()
    const content = JSON.parse(Buffer.from(data.content, "base64").toString())

    // ===== set =====
    if (i.commandName === "set") {
      const name = i.options.getString("name")
      const status = i.options.getString("status")
      const location = i.options.getString("location")
      const owner = i.options.getString("owner")
      const genre = i.options.getString("genre")

      const updated = content.map(item => {
        if (item.name === name) {
          return {
            ...item,
            status: status ?? item.status,
            location: location ?? item.location,
            owner: owner ?? item.owner,
            genre: genre ?? item.genre,
            borrower: status === "available" ? null : item.borrower
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
      await sendLog(`✏ 更新 ${name} (status:${status ?? "-"} location:${location ?? "-"} owner:${owner ?? "-"} genre:${genre ?? "-"})`)
    }

    // ===== add =====
    if (i.commandName === "add") {
      const name = i.options.getString("name")
      const genre = i.options.getString("genre")
      const location = i.options.getString("location")
      const owner = i.options.getString("owner")
      const owner_id = i.options.getString("owner_id")

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
      await sendLog(`➕ 追加 ${name} / ${genre}`)
    }

    // ===== delete =====
    if (i.commandName === "delete") {
      const name = i.options.getString("name")

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
      await sendLog(`❌ 削除 ${name}`)
    }
  }

  // ===== ボタン =====
  if (i.isButton()) {

    const [action, name] = i.customId.split("_")

    const resGit = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    })

    const data = await resGit.json()
    const content = JSON.parse(Buffer.from(data.content, "base64").toString())

    const target = content.find(item => item.name === name)
    if (!target) return

    // ===== 承認（★ここだけ dueDate追加）=====
    if (action === "approve") {

      if (String(target.owner_id) !== i.user.id) {
        return i.reply({ content: "❌ あなたは承認できません", ephemeral: true })
      }

      const now = getJST()
      const due = new Date(now)
      due.setDate(due.getDate() + LOAN_DAYS)

      const updated = content.map(item => {
        if (item.name === name) {
          return {
            ...item,
            status: "using",
            dueDate: getDateStr(due),
            pendingAt: null
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
          message: `approve ${name}`,
          content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
          sha: data.sha
        })
      })

      await i.update({
        content: `✅ 貸し出し完了: ${name}`,
        embeds: [],
        components: []
      })

      await sendLog(`✅ 承認 ${name}`)
    }

    // ===== 返却 =====
    if (action === "return") {

      const updated = content.map(item => {
        if (item.name === name) {
          return {
            ...item,
            status: "available",
            borrower: null,
            dueDate: null,
            pendingAt: null
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
          message: `return ${name}`,
          content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
          sha: data.sha
        })
      })

      await i.update({ content: `✅ 返却完了: ${name}`, components: [] })
      await sendLog(`📥 返却 ${name}`)
    }
  }
})

// ===== request（★ここだけ pendingAt追加）=====
app.post("/request", async (req, res) => {
  const { name, user, className, studentName } = req.body

  try {
    const resGit = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    })

    const data = await resGit.json()
    const content = JSON.parse(Buffer.from(data.content, "base64").toString())

    let blocked = false

    const updated = content.map(item => {
      if (item.name === name) {

        if (item.borrower !== null) {
          blocked = true
          return item
        }

        const now = getJST()

        return {
          ...item,
          status: "pending",
          pendingAt: now.toISOString(), // ✅追加
          borrower: {
            email: user,
            name: studentName,
            className: className
          }
        }
      }
      return item
    })

    if (blocked) {
      return res.status(400).json({ error: "既に申請されています" })
    }

    const ch = await client.channels.fetch(REQUEST_CHANNEL_ID)
    const target = content.find(i => i.name === name)
    const owner_id = target?.owner_id

    await ch.send({
      content: owner_id ? `<@${owner_id}>` : "",
      embeds: [{
        title: "📦 貸し出し申請",
        description: name,
        fields: [
          { name: "利用者", value: `${studentName} ${className}` }
        ]
      }],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`approve_${name}`)
            .setLabel("貸し出し完了")
            .setStyle(ButtonStyle.Success)
        )
      ]
    })

    await sendLog(`申請 ${name} | ${studentName} ${className}`)

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

app.listen(3000)
client.login(TOKEN)
