const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const liveBuildPath = path.join(appRoot, 'build');
const productionRoot = '/var/www/cutinapp.petertecnet.com.br';
const externallyManagedBuildPath = process.env.BUILD_PATH;
const buildLockPath = path.join(os.tmpdir(), 'cutinapp-frontend-build.lock');
const lockWaitMs = Number(process.env.CUTINAPP_BUILD_LOCK_WAIT_MS || 30 * 60 * 1000);
const staleLockMs = Number(process.env.CUTINAPP_BUILD_LOCK_STALE_MS || 60 * 60 * 1000);
const minFreeBytes = Number(process.env.CUTINAPP_BUILD_MIN_FREE_BYTES || 768 * 1024 * 1024);
const sleeper = new Int32Array(new SharedArrayBuffer(4));

function sleep(ms) {
  Atomics.wait(sleeper, 0, 0, ms);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function readLockOwner() {
  try {
    return JSON.parse(fs.readFileSync(path.join(buildLockPath, 'owner.json'), 'utf8'));
  } catch (_) {
    return null;
  }
}

function removeStaleBuildLock() {
  try {
    const stat = fs.statSync(buildLockPath);
    const owner = readLockOwner();
    const ageMs = Date.now() - stat.mtimeMs;
    if ((owner && !processIsAlive(Number(owner.pid))) || ageMs > staleLockMs) {
      fs.rmSync(buildLockPath, { recursive: true, force: true });
      return true;
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
  }
  return false;
}

function acquireBuildLock() {
  const deadline = Date.now() + lockWaitMs;
  while (true) {
    try {
      fs.mkdirSync(buildLockPath);
      fs.writeFileSync(path.join(buildLockPath, 'owner.json'), JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        appRoot,
      }));
      return () => {
        const owner = readLockOwner();
        if (!owner || Number(owner.pid) === process.pid) {
          fs.rmSync(buildLockPath, { recursive: true, force: true });
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (removeStaleBuildLock()) continue;
      if (Date.now() >= deadline) {
        const owner = readLockOwner();
        throw new Error(`Timed out waiting for Cutinapp frontend build lock${owner?.pid ? ` held by PID ${owner.pid}` : ''}.`);
      }
      sleep(1000);
    }
  }
}

function assertBuildHeadroom() {
  if (typeof fs.statfsSync !== 'function') return;
  const stats = fs.statfsSync(os.tmpdir());
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  if (Number.isFinite(freeBytes) && freeBytes < minFreeBytes) {
    throw new Error(`Insufficient disk headroom for Cutinapp build: ${Math.round(freeBytes / 1024 / 1024)} MiB free, minimum ${Math.round(minFreeBytes / 1024 / 1024)} MiB.`);
  }
}

function lowerBuildCpuPriority() {
  if (process.platform === 'win32' || typeof os.setPriority !== 'function') return;
  try {
    // Frontend compilation is maintenance work. Keep web/API/payment traffic
    // ahead of webpack/terser on the single-vCPU production host.
    os.setPriority(0, 15);
    console.log('Cutinapp build CPU priority lowered to preserve production responsiveness.');
  } catch (error) {
    console.warn(`Could not lower build CPU priority: ${error?.message || error}`);
  }
}

function runReactBuild(buildPath) {
  const command = process.platform === 'win32' ? 'react-scripts.cmd' : 'react-scripts';
  const env = { ...process.env, GENERATE_SOURCEMAP: "false", INLINE_RUNTIME_CHUNK: "false", IMAGE_INLINE_SIZE_LIMIT: "4096" };

  if (buildPath) {
    env.BUILD_PATH = buildPath;
  }

  const result = spawnSync(command, ['build'], {
    cwd: appRoot,
    env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function publishWithoutDowntime(stagingPath) {
  const stagedIndex = path.join(stagingPath, 'index.html');
  if (!fs.existsSync(stagedIndex)) {
    throw new Error('Production build completed without index.html. Refusing to publish.');
  }

  fs.mkdirSync(liveBuildPath, { recursive: true });
  for (const entry of fs.readdirSync(stagingPath)) {
    if (entry === 'index.html') continue;
    fs.cpSync(path.join(stagingPath, entry), path.join(liveBuildPath, entry), {
      recursive: true,
      force: true,
    });
  }

  const temporaryIndex = path.join(liveBuildPath, `.index.html.${process.pid}.tmp`);
  fs.copyFileSync(stagedIndex, temporaryIndex);
  fs.renameSync(temporaryIndex, path.join(liveBuildPath, 'index.html'));
}

lowerBuildCpuPriority();
const releaseBuildLock = acquireBuildLock();
try {
  assertBuildHeadroom();

  if (appRoot !== productionRoot || externallyManagedBuildPath) {
    runReactBuild(externallyManagedBuildPath);
  } else {
    const stagingPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cutinapp-build-'));
    try {
      runReactBuild(stagingPath);
      publishWithoutDowntime(stagingPath);
      console.log('Published Cutinapp build with index.html switched last.');
    } finally {
      fs.rmSync(stagingPath, { recursive: true, force: true });
    }
  }
} finally {
  releaseBuildLock();
}
