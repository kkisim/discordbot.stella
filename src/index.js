// 스텔라이브 치지직 방송 알림/조회용 디스코드 봇 예제
// .env.example 참고해 환경 변수를 설정하세요.
require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const axios = require('axios');

const {
  DISCORD_TOKEN,
  DISCORD_ANNOUNCE_CHANNEL_ID,
  MENTION_ROLE_ID,
  CHZZK_API_KEY,
  POLL_INTERVAL_MS = 60000,
} = process.env;

// 스텔라이브 멤버 치지직 채널 목록
const channels = [
  { name: '시라유키 히나', id: 'b044e3a3b9259246bc92e863e7d3f3b8' },
  { name: '강지', id: 'b5ed5db484d04faf4d150aedd362f34b' },
  { name: '하나코 나나', id: '4d812b586ff63f8a2946e64fa860bbf5' },
  { name: '유즈하 리코', id: '8fd39bb8de623317de90654718638b10' },
  { name: '텐코 시부키', id: '64d76089fba26b180d9c9e48a32600d9' },
  { name: '아무쿠모 린', id: '516937b5f85cbf2249ce31b0ad046b0f' },
  { name: '아카네 리제', id: '4325b1d5bbc321fad3042306646e2e50' },
  { name: '아야츠노 유니', id: '45e71a76e949e16a34764deb962f9d9f' },
  { name: '사키하네 후야', id: '36ddb9bb4f17593b60f1b63cec86611d' },
  { name: '아라하시 타비', id: 'a6c4ddb09cdb160478996007bff35296' },
  { name: '네네코 마시로', id: '4515b179f86b67b4981e16190817c580' },
];

if (!DISCORD_TOKEN) {
  console.error('환경 변수 DISCORD_TOKEN이 필요합니다.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function fetchChzzkLiveStatus(channelId) {
  const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}`;
  const headers = {
    'User-Agent': 'stella-discord-bot/1.0',
    ...(CHZZK_API_KEY ? { Authorization: `Bearer ${CHZZK_API_KEY}` } : {}),
  };

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const { data } = await axios.get(url, {
        headers,
        timeout: 7000,
      });
      const { liveTitle, liveStatus, concurrentUserCount, categoryType } =
        data?.content ?? {};
      return { liveTitle, liveStatus, concurrentUserCount, categoryType };
    } catch (err) {
      const isLast = attempt === maxRetries;
      const transient =
        err.code === 'ECONNRESET' ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ETIMEDOUT';
      if (!transient || isLast) {
        throw err;
      }
      await new Promise((res) => setTimeout(res, 800 * attempt));
    }
  }
}

function buildStatusLine(name, channelId, info) {
  const statusText = info.liveStatus === 'OPEN' ? '방송 중 🔴' : '오프라인 ⚪️';
  const link = `https://chzzk.naver.com/live/${channelId}`;
  return [
    `${statusText} ${name}`,
    `제목: ${info.liveTitle ?? '제목 없음'}`,
    `시청자: ${info.concurrentUserCount ?? 0}`,
    `카테고리: ${info.categoryType ?? 'N/A'}`,
    `링크: ${link}`,
  ].join('\n');
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.content.trim() === '!치지직') {
    try {
      const results = await Promise.all(
        channels.map(async (ch) => {
          const info = await fetchChzzkLiveStatus(ch.id);
          return buildStatusLine(ch.name, ch.id, info);
        }),
      );
      await message.reply(results.join('\n\n'));
    } catch (err) {
      console.error(err);
      await message.reply('치지직 정보를 가져오다 오류가 발생했습니다.');
    }
  }
});

const lastStatusMap = {};

async function pollLive() {
  if (!DISCORD_ANNOUNCE_CHANNEL_ID) return; // 알림 채널이 없으면 폴링만 유지
  for (const ch of channels) {
    try {
      const info = await fetchChzzkLiveStatus(ch.id);
      const now = info.liveStatus === 'OPEN' ? 'ON' : 'OFF';
      if (lastStatusMap[ch.id] !== 'ON' && now === 'ON') {
        const channel = await client.channels.fetch(DISCORD_ANNOUNCE_CHANNEL_ID);
        const mention = MENTION_ROLE_ID ? `<@&${MENTION_ROLE_ID}> ` : '';
        await channel.send(
          `${mention}🔴 ${ch.name} 방송 시작!\n${buildStatusLine(ch.name, ch.id, info)}`,
        );
      }
      lastStatusMap[ch.id] = now;
    } catch (e) {
      console.error(`poll error for ${ch.name}`, e);
    }
  }
}

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  const interval = Number(POLL_INTERVAL_MS) || 60000;
  setInterval(pollLive, interval);
});

client.login(DISCORD_TOKEN);
