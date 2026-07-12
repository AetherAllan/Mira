import "dotenv/config";
import { ensureCompanionContext } from "@/db/repo";

const telegramUserId = process.env.TELEGRAM_ALLOWED_USER_ID?.trim();
if (!telegramUserId) throw new Error("TELEGRAM_ALLOWED_USER_ID is required to seed Mira");

const context = await ensureCompanionContext({
  telegramUserId,
  displayName: "Mira user",
});

console.log(
  `Seeded ${context.companion.name}: companion=${context.companion.id}, characters=${context.world.characters.length}`,
);
