// The VPS's pm2 apps: the backend and the NID registry, each on a localhost port
// behind nginx. deploy/deploy.sh starts them and sets the ports, the backend's
// public URL and its dashboards' origins; each service's secrets stay in its .env.
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const env = process.env

for (const key of ["VANGUARD_PUBLIC_BASE_URL", "VANGUARD_CORS_ORIGINS"]) {
  if (!env[key]) throw new Error(`${key} is not set: start these apps with deploy/deploy.sh`)
}

const apiPort = env.VANGUARD_API_PORT || "3130"
const nidPort = env.VANGUARD_NID_PORT || "3131"
const dataDir = env.VANGUARD_DATA_DIR || "/var/lib/vanguard"

function uvicorn(name, dir, port, args, appEnv) {
  return {
    name,
    cwd: path.join(root, dir),
    script: path.join(root, dir, ".venv/bin/uvicorn"),
    args: ["app.main:app", "--host", "127.0.0.1", "--port", port, ...args],
    interpreter: "none",
    // A single process: the backend keeps each call's media stream in memory.
    exec_mode: "fork",
    instances: 1,
    max_restarts: 10,
    restart_delay: 2000,
    kill_timeout: 10000,
    env: { PYTHONUNBUFFERED: "1", ...appEnv },
  }
}

module.exports = {
  apps: [
    uvicorn("vanguard-nid", "nid-server", nidPort, [], {}),
    uvicorn("vanguard-api", "server", apiPort, ["--proxy-headers"], {
      PUBLIC_BASE_URL: env.VANGUARD_PUBLIC_BASE_URL,
      CORS_ORIGINS: env.VANGUARD_CORS_ORIGINS,
      NID_SERVER_URL: `http://127.0.0.1:${nidPort}`,
      DATABASE_URL: `sqlite:///${dataDir}/dlas.db`,
      UPLOAD_DIR: `${dataDir}/uploads`,
    }),
  ],
}
