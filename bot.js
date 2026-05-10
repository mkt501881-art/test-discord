const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js")
const fetch = require("node-fetch")

// ===== 設定 =====
const TOKEN = process.env.DISCORD_TOKEN
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const CLIENT_ID = process.env.CLIENT_ID

const REPO = "mkt501881-art/status"   // ← 自分のに変更
const FILE_PATH = "status.json"            // フォルダなら "data/status.json"

// ===== Discordクライアント =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ]
})

// ===== Slashコマンド登録 =====
const commands = [
  new SlashCommandBuilder()
    .setName("set")
    .setDescription("ステータス更新")
    .addStringOption(option =>
      option.setName("name")
        .setDescription("文庫名")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("status")
        .setDescription("貸し出し状況（available / using）")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("location")
        .setDescription("保管場所")
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName("owner")
        .setDescription("出品者")
        .setRequired(false)
    )
].map(cmd => cmd.toJSON())

const rest = new REST({ version: "10" }).setToken(TOKEN)

async function registerCommands() {
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    )
    console.log("✅ Slashコマンド登録完了")
  } catch (err) {
    console.error("コマンド登録エラー:", err)
  }
}

// ===== 起動完了 =====
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`)
  registerCommands()
})

// ===== Slashコマンド処理 =====
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  if (interaction.commandName === "set") {

      // ✅ ロールチェック（ここ！！）
  const allowedRoleId = "1502839785834811422"

  if (!interaction.member.roles.cache.has(allowedRoleId)) {
    return interaction.reply({
      content: "❌ このコマンドを使う権限がありません",
      ephemeral: true
    })
  }

    const name = interaction.options.getString("name")
    const status = interaction.options.getString("status")
    const location = interaction.options.getString("location")
    const owner = interaction.options.getString("owner")

    // ✅ statusバリデーション
    if (!["available", "using"].includes(status)) {
      return interaction.reply("❌ statusは available / using のどちらかのみです")
    }

    try {
      // ===== ① 現在のstatus.json取得 =====
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`
        }
      })

      if (!res.ok) {
        throw new Error(`GitHub取得失敗: ${res.status}`)
      }

      const data = await res.json()

      const content = JSON.parse(
        Buffer.from(data.content, "base64").toString()
      )

      // ===== ② 更新処理 =====
      let foundFlag = false

      const updated = content.map(item => {
        if (item.name === name) {
          foundFlag = true
          return {
            ...item,
            status: status,
            location: location ?? item.location,
            owner: owner ?? item.owner
          }
        }
        return item
      })

      if (!foundFlag) {
        return interaction.reply("❌ 指定されたnameは存在しません")
      }

      // ===== ③ GitHubへPUT（更新） =====
      const updateRes = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
        {
          method: "PUT",
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: `update ${name} status`,
            content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
            sha: data.sha
          })
        }
      )

      if (!updateRes.ok) {
        throw new Error(`status.jsonの更新に失敗しました: ${updateRes.status}`)
      }

      await interaction.reply(`✅ ${name} を更新しました`)

    } catch (err) {
      console.error(err)
      await interaction.reply("❌ エラー: " + err.message)
    }
  }
})

// ===== 起動 =====
client.login(TOKEN)
