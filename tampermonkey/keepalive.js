// ==UserScript==
// @name         ScavengerMineHeadless-ItsDave_ADA — 10-Minute Heartbeat
// @namespace    ItsDave_ADA
// @version      2.4.0
// @description  Auto-starts and maintains ScavengerMine sessions for the Midnight Scavenger Hunt mining NIGHT.
// @match        https://sm.midnight.gd/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/*
------------------------------------------------------------------------------------
🪙 SUMMARY
Automatically maintains ScavengerMine uptime by checking every 10 minutes:
• Starts a session if stopped or idle.
• Reloads the page if the “Start Session” button isn’t visible or fails to appear.
• Does **not** reload while a challenge is running (“Finding a solution”).
• Uses a 1-minute guard timer to prevent repeated reloads.
• Designed to be **extremely lightweight**, running silently with minimal CPU impact.

💡 MOTIVATION
Created after discovering my miner had continued running overnight but stopped
progressing, missing multiple challenges until I manually refreshed the page.
This script automates that refresh step to ensure continuous mining and challenge
participation even while away.

🔍 CONTEXT
The ScavengerMine site (https://sm.midnight.gd/) is a single-page app that can remain
“running” while the UI silently stalls, leaving the miner active but unable to start
new challenges without a manual refresh.
This script adds a lightweight self-healing mechanism — it reloads only when no
challenge is running and the “Start” button is missing, ensuring uninterrupted and
reliable mining uptime.

⚙️ REQUIREMENTS
• Wallet must be connected before running.
• Requires the Tampermonkey extension (to run userscripts):
  🔗 https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en-GB&utm_source=ext_sidebar
• Works only on https://sm.midnight.gd/.

⚠️ DISCLAIMER
Use at your own risk — no warranties or liability implied.
Intended solely to assist with maintaining uptime during the Midnight Scavenger Hunt.
------------------------------------------------------------------------------------
*/

(function () {
    const TAG = "[ScavengerMineHeadless-ItsDave_ADA]";

    const HEARTBEAT_MS      = 10 * 60_000; // every 10 min
    const BOOT_GRACE_MS     = 5_000;       // wait for UI
    const START_WAIT_LOOPS  = 16;          // ~8s
    const START_WAIT_STEPMS = 500;
    const RELOAD_GUARD_MS   = 60_000;      // 1 min reload guard

    let lastReloadAt = 0;

    const $all = (sel) => Array.from(document.querySelectorAll(sel));
    const findBtn = (txt) =>
        $all("button").find(b => (b.textContent || "").toLowerCase().includes(txt.toLowerCase()));
    const now = () => Date.now();

    function isSolving() {
        const nodes = document.querySelectorAll("div, span, li, section");
        const rows = Array.from(nodes).filter(el => /finding a solution/i.test(el.textContent || ""));
        if (rows.length === 0) return false;

        for (const row of rows) {
            const scope = row.closest("div") || row.parentElement || document.body;
            const txt = scope.textContent || "";
            const m = /\btime left:\s*(\d{2}:\d{2}:\d{2})/i.exec(txt);
            if (m) {
                const [h, m2, s] = m[1].split(":").map(Number);
                if (h + m2 + s > 0) {
                    console.log(`${TAG} Challenge running — ${m[1]} remaining. Skipping.`);
                    return true;
                }
            }
        }
        console.log(`${TAG} Challenge appears active. Skipping.`);
        return true;
    }

    function isNextChallengeReady() {
        const nodes = document.querySelectorAll("div, span");
        const rows = Array.from(nodes).filter(el => /next challenge in/i.test(el.textContent || ""));
        if (rows.length === 0) return false;

        for (const row of rows) {
            const scope = row.closest("div") || row.parentElement || document.body;
            const txt = scope.textContent || "";
            // 匹配 "Next challenge in: 00:00:00:00" 或 "00:00:00" 格式
            const m = /next challenge in[:\s]*(\d{2}:\d{2}:\d{2}(?::\d{2})?)/i.exec(txt);
            if (m) {
                const timeStr = m[1];
                const parts = timeStr.split(":").map(Number);
                // 检查所有部分是否都是0
                const allZero = parts.every(p => p === 0);
                if (allZero) {
                    console.log(`${TAG} Next challenge is ready (00:00:00). Proceeding with heartbeat.`);
                    return true;
                }
            }
        }
        return false;
    }

    async function tryStart() {
        const start = findBtn("start session");
        if (!start || start.disabled) return false;

        console.log(`${TAG} Starting session...`);
        start.click();

        for (let i = 0; i < START_WAIT_LOOPS; i++) {
            await new Promise(r => setTimeout(r, START_WAIT_STEPMS));
            if (findBtn("stop session")) {
                console.log(`${TAG} Session started.`);
                return true;
            }
        }
        console.log(`${TAG} Start not confirmed; will retry next heartbeat.`);
        return false;
    }

    function safeReload(reason) {
        if (now() - lastReloadAt < RELOAD_GUARD_MS) {
            console.log(`${TAG} Reload guard active — skip.`);
            return;
        }
        console.log(`${TAG} Reloading — ${reason} @ ${new Date().toLocaleTimeString()}`);
        lastReloadAt = now();
        location.reload();
    }

    async function heartbeat() {
        const stop = findBtn("stop session");
        if (stop) {
            console.log(`${TAG} Session running.`);
            return;
        }

        // 如果 Next challenge in 是 00:00:00，则进行保活（即使 isSolving 返回 true）
        const nextReady = isNextChallengeReady();
        if (nextReady) {
            console.log(`${TAG} Next challenge ready (00:00:00), proceeding with heartbeat.`);
            const started = await tryStart();
            if (!started) {
                console.log(`${TAG} Start not visible; reloading.`);
                safeReload("Next challenge ready but Start not visible");
            }
            return;
        }

        // 如果正在解决挑战，跳过保活
        if (isSolving()) return;

        // 默认保活逻辑
        const started = await tryStart();
        if (!started) {
            console.log(`${TAG} Start not visible; reloading.`);
            safeReload("session stopped and Start not visible");
        }
    }

    console.log(`${TAG} Heartbeat active — runs every 10 minutes.`);

    setTimeout(() => {
        heartbeat();
        setInterval(heartbeat, HEARTBEAT_MS);
    }, BOOT_GRACE_MS);
})();
