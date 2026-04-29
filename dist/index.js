"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const firebase_1 = require("./lib/firebase");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_MAX_MESSAGE = 3500;
const LIVELO_PARTNERS_URL = process.env.LIVELO_PARTNERS_URL ?? "https://www.livelo.com.br/ganhe-pontos-em-compras-online";
const storeMeta = {};
const profileCodeAliases = {
    "Casas Bahia": "csb",
};
const imageUrlCache = new Map();
const partnerUrlCache = new Map();
function slugifyStore(name) {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}
function sanitizeStoreName(name) {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}
function normalizeForMatch(name) {
    return sanitizeStoreName(name).replace(/(com|site|store)$/g, "");
}
function getStoreImageFallback(store) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(store)}&background=f3f4f6&color=111827&size=256&bold=true`;
}
function getImageCandidates(store) {
    const alias = profileCodeAliases[store];
    const slug = slugifyStore(store).replace(/-/g, "");
    const sanitized = sanitizeStoreName(store);
    const bases = [alias, slug, sanitized].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);
    const extensions = ["jpeg", "jpg", "png", "webp"];
    const candidates = [];
    for (const base of bases) {
        for (const ext of extensions) {
            candidates.push(`https://partners-profile.livelo.com.br/${base}/image.${ext}`);
        }
    }
    return candidates;
}
async function resolveStoreImageUrl(store) {
    if (imageUrlCache.has(store)) {
        return imageUrlCache.get(store);
    }
    const candidates = getImageCandidates(store);
    for (const candidate of candidates) {
        try {
            const response = await fetch(candidate, { method: "HEAD" });
            if (response.ok) {
                imageUrlCache.set(store, candidate);
                return candidate;
            }
        }
        catch {
            // ignore and keep trying the next candidate
        }
    }
    const fallback = getStoreImageFallback(store);
    imageUrlCache.set(store, fallback);
    return fallback;
}
function getPartnerRulesUrl(store) {
    if (storeMeta[store]?.partnerRulesUrl)
        return storeMeta[store].partnerRulesUrl;
    if (partnerUrlCache.has(store))
        return partnerUrlCache.get(store);
    return "https://www.livelo.com.br/";
}
async function fetchPartnerCatalogFromLivelo() {
    try {
        const { chromium } = await Promise.resolve().then(() => __importStar(require("playwright")));
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(LIVELO_PARTNERS_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500);
        const partners = await page.evaluate(() => {
            const results = [];
            const anchors = Array.from(document.querySelectorAll('a[data-testid="a_PartnerCard_card_link"][href]'));
            const origin = window.location.origin;
            for (const anchor of anchors) {
                const href = anchor.getAttribute("href") ?? "";
                if (!href)
                    continue;
                const partnerUrl = new URL(href, origin).href;
                const image = anchor.querySelector('img[data-testid="img_PartnerCard_partnerImage"]');
                const imageSrc = image?.getAttribute("src") ??
                    image?.getAttribute("data-src") ??
                    image?.getAttribute("srcset")?.split(",")[0]?.trim().split(" ")[0] ??
                    "";
                const imageUrl = imageSrc ? new URL(imageSrc, origin).href : undefined;
                const nameFromAlt = image?.getAttribute("alt")?.replace(/^Logo\s+/i, "").trim() ?? "";
                const nameFromText = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
                const slugFromHref = partnerUrl
                    .split("/juntar-pontos/parceiros/")[1]
                    ?.split("/")[0]
                    ?.replace(/-/g, " ")
                    .trim() ?? "";
                const resolvedName = nameFromAlt || nameFromText || slugFromHref;
                if (!resolvedName)
                    continue;
                results.push({
                    name: resolvedName.slice(0, 120),
                    imageUrl,
                    partnerUrl,
                });
            }
            // Deduplicate by URL
            const unique = new Map();
            for (const item of results) {
                if (!item.partnerUrl)
                    continue;
                if (!unique.has(item.partnerUrl))
                    unique.set(item.partnerUrl, item);
            }
            return Array.from(unique.values());
        });
        console.log(`[livelo] partner cards parsed: ${partners.length}`);
        await browser.close();
        return partners;
    }
    catch (error) {
        console.log(`[livelo] could not read partner catalog: ${error instanceof Error ? error.message : "unknown"}`);
        return [];
    }
}
function resolvePartnerDataFromCatalog(store, catalog) {
    if (catalog.length === 0)
        return null;
    const target = normalizeForMatch(store);
    let best = null;
    for (const item of catalog) {
        const candidate = normalizeForMatch(item.name);
        if (!candidate)
            continue;
        if (candidate.includes(target) || target.includes(candidate)) {
            best = item;
            if (candidate === target)
                return item;
        }
    }
    return best;
}
function logPartnerResolution(store, meta) {
    console.log(`[resolver] ${store} -> image(${meta.imageSource}): ${meta.imageUrl} | partner(${meta.partnerSource}): ${meta.partnerRulesUrl}`);
}
async function loadPromosFromFile() {
    const filePath = node_path_1.default.resolve(process.cwd(), "data", "promos.json");
    const raw = await (0, promises_1.readFile)(filePath, "utf-8");
    return JSON.parse(raw);
}
async function savePromosToFile(payload) {
    const filePath = node_path_1.default.resolve(process.cwd(), "data", "promos.json");
    await (0, promises_1.writeFile)(filePath, JSON.stringify(payload, null, 2), "utf-8");
}
async function sendTelegramAlert(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log("[telegram] skipped: missing TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID");
        return false;
    }
    const endpoint = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
        }),
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`[telegram] send failed (${response.status}): ${body}`);
    }
    console.log("[telegram] message sent successfully");
    return true;
}
function splitTelegramMessage(message, maxSize) {
    if (message.length <= maxSize)
        return [message];
    const parts = [];
    let current = "";
    for (const line of message.split("\n")) {
        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length <= maxSize) {
            current = candidate;
            continue;
        }
        if (current) {
            parts.push(current);
            current = line;
        }
        else {
            // fallback for very large single lines
            for (let i = 0; i < line.length; i += maxSize) {
                parts.push(line.slice(i, i + maxSize));
            }
            current = "";
        }
    }
    if (current)
        parts.push(current);
    return parts;
}
function formatTelegramMessage(promo) {
    const details = promo.detalhesPromo?.[0] ?? `${promo.atual} pts/R$1`;
    return [
        "🔥 Promocao detectada na Livelo",
        `Loja: ${promo.loja}`,
        `Atual: ${promo.atual} pts/R$1`,
        `Anterior: ${promo.anterior} pts/R$1`,
        `Detalhe: ${details}`,
    ].join("\n");
}
function formatPendingPeopleSection(people) {
    if (people.length === 0) {
        return "👥 Pendentes:\nNenhuma pessoa pendente no momento.";
    }
    const lines = people.map((person) => `- ${person.name} | loja: ${person.store} | meta: ${person.desiredPoints} pts/R$1`);
    return ["👥 Pendentes:", ...lines].join("\n");
}
function buildPromotionsSignature(promos) {
    return promos
        .map((promo) => ({
        loja: slugifyStore(promo.loja),
        atual: promo.atual,
        anterior: promo.anterior,
        promo: promo.promo,
        detalhe: promo.detalhesPromo?.[0] ?? "",
    }))
        .sort((a, b) => a.loja.localeCompare(b.loja))
        .map((item) => `${item.loja}|${item.atual}|${item.anterior}|${item.promo ? 1 : 0}|${item.detalhe}`)
        .join("||");
}
async function runScraper() {
    const forceAlert = process.argv.includes("--force-alert");
    const runStartedAt = new Date();
    const executedAt = runStartedAt.toISOString();
    const promoFile = await loadPromosFromFile();
    const scanRef = firebase_1.db.collection("scans").doc("latest");
    const schedulerRef = firebase_1.db.collection("scheduler").doc("config");
    const schedulerDoc = await schedulerRef.get();
    const schedulerConfig = (schedulerDoc.data() ?? {});
    const partnerCatalog = [];
    const originalPromos = promoFile.promos ?? [];
    const allPromos = [];
    for (const promo of originalPromos) {
        const partnerFromSite = resolvePartnerDataFromCatalog(promo.loja, partnerCatalog);
        if (partnerFromSite?.partnerUrl) {
            partnerUrlCache.set(promo.loja, partnerFromSite.partnerUrl);
        }
        let imageSource = "fallback";
        let imageUrl = "";
        if (partnerFromSite?.imageUrl) {
            imageUrl = partnerFromSite.imageUrl;
            imageSource = "livelo-site";
        }
        else if (promo.imageUrl) {
            imageUrl = promo.imageUrl;
            imageSource = "promos-cache";
        }
        else {
            imageUrl = await resolveStoreImageUrl(promo.loja);
            imageSource = "fallback";
        }
        const partnerSource = partnerFromSite?.partnerUrl
            ? "livelo-site"
            : "default";
        const partnerRulesUrl = partnerFromSite?.partnerUrl ?? getPartnerRulesUrl(promo.loja);
        logPartnerResolution(promo.loja, {
            imageUrl,
            partnerRulesUrl,
            imageSource,
            partnerSource,
        });
        allPromos.push({
            ...promo,
            imageUrl,
            partnerRulesUrl,
        });
    }
    await savePromosToFile({
        lastUpdated: executedAt,
        promos: allPromos,
    });
    const activePromos = allPromos.filter((promo) => promo.promo || promo.atual > promo.anterior);
    const promotionsSignature = buildPromotionsSignature(activePromos);
    const hasPromotionsChanged = promotionsSignature !== (schedulerConfig.lastNotificationSignature ?? "");
    const shouldNotify = forceAlert || hasPromotionsChanged;
    const telegramMessages = [];
    const pendingPeopleSnapshot = await firebase_1.db
        .collection("alertRegistrations")
        .where("status", "==", "aguardando")
        .where("active", "==", true)
        .get();
    const pendingPeople = pendingPeopleSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            name: data.personName ?? "Sem nome",
            store: data.store ?? "Sem loja",
            desiredPoints: Number(data.targetPoints ?? 0),
        };
    });
    await scanRef.set({
        id: scanRef.id,
        source: "screper_livelo",
        status: "success",
        executedAt,
        fileLastUpdated: promoFile.lastUpdated,
        totalPromos: allPromos.length,
        activePromos: activePromos.length,
        sitePartnersFound: partnerCatalog.length,
        updatedAt: executedAt,
    });
    for (const promo of activePromos) {
        const alertId = slugifyStore(promo.loja);
        const imageUrl = promo.imageUrl ?? (await resolveStoreImageUrl(promo.loja));
        const partnerRulesUrl = promo.partnerRulesUrl ?? getPartnerRulesUrl(promo.loja);
        const peopleSnapshot = await firebase_1.db
            .collection("people")
            .where("store", "==", promo.loja)
            .where("status", "==", "waiting")
            .where("active", "==", true)
            .get();
        const eligiblePeople = peopleSnapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((person) => person.desiredPoints <= promo.atual);
        const alertRef = firebase_1.db.collection("alerts").doc(alertId);
        await alertRef.set({
            id: alertId,
            store: promo.loja,
            currentPoints: promo.atual,
            previousPoints: promo.anterior,
            triggeredAt: executedAt,
            promo: promo.promo,
            details: promo.detalhesPromo ?? [],
            imageUrl,
            partnerRulesUrl,
            notifiedPeople: eligiblePeople.map((person) => person.name),
            sourceScanId: scanRef.id,
            source: "promos.json",
            updatedAt: executedAt,
        }, { merge: true });
        console.log(`[firebase] alert upsert -> id=${alertId} store=${promo.loja} imageUrl=${imageUrl} partnerRulesUrl=${partnerRulesUrl}`);
        if (eligiblePeople.length > 0) {
            await Promise.all(eligiblePeople.map((person) => firebase_1.db.collection("people").doc(person.id).update({
                status: "triggered",
                updatedAt: executedAt,
            })));
        }
        telegramMessages.push(formatTelegramMessage(promo));
    }
    if (telegramMessages.length > 0 && shouldNotify) {
        const header = `🚨 Resumo de promocoes Livelo (${activePromos.length})\n`;
        const fullMessage = `${header}\n${telegramMessages.join("\n\n--------------------\n\n")}`;
        const chunks = splitTelegramMessage(fullMessage, TELEGRAM_MAX_MESSAGE);
        for (let i = 0; i < chunks.length; i += 1) {
            const chunkHeader = chunks.length > 1 ? `[parte ${i + 1}/${chunks.length}]\n` : "";
            await sendTelegramAlert(`${chunkHeader}${chunks[i]}`);
        }
    }
    else if (!shouldNotify) {
        console.log("[telegram] skipped: no promotion changes since last notification");
    }
    else {
        console.log("[telegram] no active promotions to send");
    }
    if (shouldNotify) {
        const pendingMessage = formatPendingPeopleSection(pendingPeople);
        const pendingChunks = splitTelegramMessage(pendingMessage, TELEGRAM_MAX_MESSAGE);
        for (let i = 0; i < pendingChunks.length; i += 1) {
            const chunkHeader = pendingChunks.length > 1 ? `[pendentes ${i + 1}/${pendingChunks.length}]\n` : "";
            await sendTelegramAlert(`${chunkHeader}${pendingChunks[i]}`);
        }
    }
    await schedulerRef.set({
        lastRunAt: executedAt,
        lastScanTime: executedAt,
        lastStatus: "success",
        isRunning: false,
        lastNotificationSignature: promotionsSignature,
        lastNotificationAt: shouldNotify ? executedAt : schedulerConfig.lastNotificationAt ?? null,
    }, { merge: true });
    console.log(`[scraper] scan ${scanRef.id} processed ${allPromos.length} stores, ${activePromos.length} active promos`);
    console.log("[firebase] scan summary and scheduler status saved");
}
runScraper().catch(async (error) => {
    const failedAt = new Date().toISOString();
    await firebase_1.db.collection("scheduler").doc("config").set({
        lastRunAt: failedAt,
        lastStatus: "error",
        lastError: error instanceof Error ? error.message : "Unknown error",
    }, { merge: true });
    console.error("[scraper] execution failed:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map