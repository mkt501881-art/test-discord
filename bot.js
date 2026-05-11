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

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

// ✅ コマンド
const commands = [

  // ===== set =====
  new SlashCommandBuilder()
    .setName("set")
    .setDescription("ステータス更新")
    .addStringOption(o => o.setName("name").setRequired(true))
    .addStringOption(o =>
      o.setName("status").setRequired(true)
      .addChoices(
        { name: "貸し出し可能", value: "available" },
        { name: "貸し出し中", value: "using" }
      )
    )
    .addStringOption(o => o.setName("location"))
    .addStringOption(o => o.setName("owner"))
    .addStringOption(o =>
      o.setName("genre")
       .addChoices(
         { name: "マンガ", value: "マンガ" },
         { name: "ライトノベル", value: "ライトノベル" },
         { name: "小説", value: "小説" },
         { name: "その他", value: "その他" }
       )
    ),

  // ===== add =====
new SlashCommandBuilder()
  .setName("add")
  .setDescription("本を追加")

  .addStringOption(o =>
    o.setName("name")
     .setDescription("本の名前")   // ← 追加 ✅
     .setRequired(true)
  )

  .addStringOption(o =>
    o.setName("genre")
     .setDescription("ジャンル")   // ← 追加 ✅
     .setRequired(true)
     .addChoices(
       { name: "マンガ", value: "マンガ" },
       { name: "ライトノベル", value: "ライトノベル" },
       { name: "小説", value: "小説" },
       { name: "その他", value: "その他" }
     )
  )

  .addStringOption(o =>
    o.setName("location")
     .setDescription("保管場所")   // ← 追加 ✅
     .setRequired(true)
  )

  .addStringOption(o =>
    o.setName("owner")
     .setDescription("出品者")   // ← 追加 ✅
     .setRequired(true)
  )
  
  // ===== delete =====
new SlashCommandBuilder()
  .setName("delete")
  .setDescription("本を削除")

  .addStringOption(o =>
    o.setName("name")
     .setDescription("削除する本の名前")  // ← 追加 ✅
     .setRequired(true)
  )

].map(c => c.toJSON())

const rest = new REST({ version: "10" }).setToken(TOKEN)

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  )
  console.log("✅ コマンド登録完了")
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`)
  registerCommands()
})


// ✅ 共通：権限チェック
function checkRole(interaction) {
  const allowedRoleId = "1502839785834811422"
  return interaction.member.roles.cache.has(allowedRoleId)
}


// ===== Slash処理 =====
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  if (!checkRole(interaction)) {
    return interaction.reply({
      content: "❌ 権限がありません",
      ephemeral: true
    })
  }

  // ===== set =====
  if (interaction.commandName === "set") {
    const name = interaction.options.getString("name")
    const status = interaction.options.getString("status")
    const location = interaction.options.getString("location")
    const owner = interaction.options.getString("owner")
    const genre = interaction.options.getString("genre")

    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      })

      const data = await res.json()

      const content = JSON.parse(Buffer.from(data.content, "base64").toString())

      const updated = content.map(item => {
        if (item.name === name) {
          return {
            ...item,
            status,
            location: location ?? item.location,
            owner: owner ?? item.owner,
            genre: genre ?? item.genre
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
          message: `update ${name}`,
          content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
          sha: data.sha
        })
      })

      await interaction.reply(`✅ ${name} を更新しました`)
    } catch (err) {
      await interaction.reply("エラー: " + err.message)
    }
  }

  // ===== add =====
  if (interaction.commandName === "add") {
    const name = interaction.options.getString("name")
    const genre = interaction.options.getString("genre")
    const location = interaction.options.getString("location")
    const owner = interaction.options.getString("owner")

    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
      })

      const data = await res.json()
      const content = JSON.parse(Buffer.from(data.content, "base64").toString())

      if (content.find(item => item.name === name)) {
        return interaction.reply({
          content: "❌ 同じ名前の本が存在します",
          ephemeral: true
        })
      }

      content.push({
        name,
        status: "available",
        location,
        owner,
        genre
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

      await interaction.reply(`✅ ${name} を追加しました`)
    } catch (err) {
      await interaction.reply("エラー: " + err.message)
    }
  }

  // ===== delete =====
  if (interaction.commandName === "delete") {
    const name = interaction.options.getString("name")

    try {
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

      await interaction.reply(`✅ ${name} を削除しました`)
    } catch (err) {
      await interaction.reply("エラー: " + err.message)
    }
  }
})


// ===== Web API =====
app.post("/request", async (req, res) => {
  const { name, user, location, owner, className, number, studentName } = req.body

  try {
    const channel = await client.channels.fetch("1503222413096128633")

    await channel.send({
      embeds: [{
        title: "📦 貸し出し申請",
        description: name,
        color: 0x00cc66,
        fields: [
          { name: "メール", value: user || "不明" },
          { name: "出品者", value: owner || "不明" },
          { name: "保管場所", value: location || "不明" },
          { name: "所属", value: className || "未入力" },
          { name: "出席番号", value: number || "未入力" },
          { name: "名前", value: studentName || "未入力" }
        ]
      }]
    })

    res.json({ ok: true })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(3000)

client.login(TOKEN)
