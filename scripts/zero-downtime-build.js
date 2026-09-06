const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const liveBuildPath = path.join(appRoot, 'build');
const productionRoot = '/var/www/cutinapp.petertecnet.com.br';
const externallyManagedBuildPath = process.env.BUILD_PATH;

function runReactBuild(buildPath) {
  const command = process.platform === 'win32' ? 'react-scripts.cmd' : 'react-scripts';
  const env = { ...process.env };

  if (buildPath) {
    env.BUILD_PATH = buildPath;
  }

  const result = spawnSync(command, ['build'], {
    cwd: appRoot,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function publishWithoutDowntime(stagingPath) {
  const stagedIndex = path.join(stagingPath, 'index.html');

  if (!fs.existsSync(stagedIndex)) {
    throw new Error('Production build completed without index.html. Refusing to publish.');
  }

  fs.mkdirSync(liveBuildPath, { recursive: true });

  for (const entry of fs.readdirSync(stagingPath)) {
    if (entry === 'index.html') {
      continue;
    }

    fs.cpSync(path.join(stagingPath, entry), path.join(liveBuildPath, entry), {
      recursive: true,
      force: true,
    });
  }

  // Keep the currently served index in place until every hashed asset from the
  // new release is available. The final rename is atomic on the same filesystem.
  const temporaryIndex = path.join(liveBuildPath, `.index.html.${process.pid}.tmp`);
  fs.copyFileSync(stagedIndex, temporaryIndex);
  fs.renameSync(temporaryIndex, path.join(liveBuildPath, 'index.html'));
}

if (appRoot !== productionRoot || externallyManagedBuildPath) {
  runReactBuild(externallyManagedBuildPath);
  process.exit(0);
}

const stagingPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cutinapp-build-'));

try {
  runReactBuild(stagingPath);
  publishWithoutDowntime(stagingPath);
  console.log('Published Cutinapp build with index.html switched last.');
} finally {
  fs.rmSync(stagingPath, { recursive: true, force: true });
}
