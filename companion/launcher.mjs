import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = process.env.MUSTER_CODEX_CDP_PORT || "9223";
const running = spawnSync("pgrep", ["-x", "ChatGPT"], { stdio: "ignore" }).status === 0;
if (running) {
  console.error("ChatGPT is already running without the companion endpoint. Quit it once, then run npm run companion:launch.");
  process.exit(2);
}
spawn("open", ["-a", "/Applications/ChatGPT.app", "--args", "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`], { detached: true, stdio: "ignore" }).unref();
await new Promise(resolve => setTimeout(resolve, 2500));
const injector = fileURLToPath(new URL("./injector.mjs", import.meta.url));
spawn(process.execPath, [injector, "--port", port], { detached: true, stdio: "ignore" }).unref();
console.log("Codex launched with Muster companion. Existing pinned tasks are preserved.");
