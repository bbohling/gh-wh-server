const path = require('node:path');
const crypto = require('node:crypto'); //require("crypto");
const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const { simpleGit, CleanOptions } = require('simple-git');
const { exec } = require('child_process');

dotenv.config();

const secret = process.env.WORD;

// Validate required environment variables at startup
if (!secret) {
  console.error('❌ FATAL: WORD environment variable is not set');
  process.exit(1);
}

const sigHeaderName = "X-Hub-Signature-256";
const sigHashAlg = "sha256";

// Repository configuration
const REPO_CONFIG = {
  'bbohling/gh-wh-server': {
    path: path.join(__dirname, '..', 'ghwh.brndn.me'),
    buildCommand: null
  },
  'bbohling/jotreps-app': {
    path: path.join(__dirname, '..', 'jotreps.com'),
    buildCommand: 'bun run --filter web build',
    buildBranch: 'main'
  },
  'brycebohling/mow': {
    path: path.join(__dirname, '..', 'makerofworlds.dev'),
    buildCommand: null
  },
  'brycebohling/portfolio': {
    path: path.join(__dirname, '..', 'brycebohling.com'),
    buildCommand: null,
    lfsEnabled: true
  },
  'brycebohling/bullet-blitz': {
    path: path.join(__dirname, '..', 'bulletblitz.brycebohling.com'),
    buildCommand: null
  },
  'brycebohling/crowdthought': {
    path: path.join(__dirname, '..', 'ct.brycebohling.com'),
    buildCommand: 'npm run build',
    buildCwd: path.join(__dirname, '..', 'ct.brycebohling.com', 'client')
  },
  'brycebohling/dailyplant': {
    path: path.join(__dirname, '..', 'advent.brycebohling.com'),
    buildCommand: null
  },
  'brycebohling/gemjunction': {
    path: path.join(__dirname, '..', 'gemjunction.brycebohling.com'),
    buildCommand: null
  },
  'brycebohling/magnet-game': {
    path: path.join(__dirname, '..', 'mm.brycebohling.com'),
    buildCommand: null
  }
};

// Helper function to promisify exec with error handling
function executeCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${error.message}\nstderr: ${stderr}`));
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      if (stdout) {
        console.log(`stdout: ${stdout}`);
      }
      resolve(stdout);
    });
  });
}

// Helper function to get repo configuration
function getRepoConfig(repoName) {
  const normalizedName = repoName.toLowerCase();
  const config = REPO_CONFIG[normalizedName];
  
  if (!config) {
    throw new Error(`Unknown repository: ${repoName}`);
  }
  
  return { ...config, name: normalizedName };
}

const app = express();

// Saves a valid raw JSON body to req.rawBody
// Credits to https://stackoverflow.com/a/35651853/90674
app.use(
  bodyParser.json({
    verify: (req, res, buf, encoding) => {
      if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || "utf8");
      }
    },
  })
);

function verifyPostData(req, res, next) {
  if (!req.rawBody) {
    return next("Request body empty");
  }

  const sig = Buffer.from(req.get(sigHeaderName) || "", "utf8");
  const hmac = crypto.createHmac(sigHashAlg, secret);
  const digest = Buffer.from(
    sigHashAlg + "=" + hmac.update(req.rawBody).digest("hex"),
    "utf8"
  );
  if (sig.length !== digest.length || !crypto.timingSafeEqual(digest, sig)) {
    return next(
      `Request body digest (${digest}) did not match ${sigHeaderName} (${sig})`
    );
  }

  return next();
}

app.get("/healthcheck", function (req, res) {
  res.status(200).send("OK");
});

app.post("/fish", verifyPostData, async function (req, res) {
  let data = req.body;
  const dateTime = new Date().toISOString();
  console.log(`${dateTime} :: ${data.repository.full_name}`);
  await executeGitPull({
    repo: data?.repository?.full_name,
    ref: data?.ref
  });
  res.status(200).send("Request body was signed");
});

app.use((err, req, res, next) => {
  if (err) console.error(err);
  res.status(403).send("Request body was not signed or verification failed");
});

const port = 8008;

app.listen(port, function () {
  console.log(`🚀 webhook server is running on ${port}!`);
});


async function executeGitPull({repo, ref}) {
  try {
    // Get repository configuration
    const config = getRepoConfig(repo);
    
    // Extract branch name from ref (e.g., 'refs/heads/main' -> 'main')
    const branch = ref?.split('/').pop();
    
    // Check if this branch should trigger builds
    const allowedBranch = config.buildBranch || process.env.BUILD_BRANCH || 'main';
    if (branch && branch !== allowedBranch) {
      console.log(`⏭️  Skipping ${repo} - push on ${branch} (only building on ${allowedBranch})`);
      return { success: true, skipped: true, repo, branch };
    }
    
    // Initialize git for the repository
    const git = simpleGit(config.path);
    
    // Execute git pull (await this - it's fast)
    console.log(`Starting git pull for ${repo}...`);
    await git.pull();
    console.log(`🥳 pull for ${repo} success`);
    
    // Handle LFS if enabled (await this - it's relatively fast)
    if (config.lfsEnabled) {
      try {
        await git.raw('lfs', 'pull');
        console.log(`🥳 LFS pull for ${repo} success`);
      } catch (lfsError) {
        console.error(`⚠️  LFS pull failed for ${repo}: ${lfsError.message}`);
        // Continue execution - LFS failure shouldn't block the entire process
      }
    }
    
    // Execute build command asynchronously (don't await - can take minutes)
    if (config.buildCommand) {
      const buildCwd = config.buildCwd || config.path;
      console.log(`Starting build for ${repo}...`);
      
      // Fire and forget with proper error handling
      executeCommand(config.buildCommand, buildCwd)
        .then(() => {
          console.log(`🎉 build for ${repo} success`);
        })
        .catch((buildError) => {
          console.error(`❌ Build failed for ${repo}: ${buildError.message}`);
        });
    }
    
    return { success: true, repo };
  } catch (error) {
    // Handle unknown repository or other errors
    if (error.message.includes('Unknown repository')) {
      console.log('sad trombone!', repo?.toLowerCase());
      return { success: false, repo, error: 'Unknown repository' };
    }
    
    // Log the error and re-throw
    console.error(`❌ Error processing ${repo}: ${error.message}`);
    throw error;
  }
}

/*
code largely from: https://gist.github.com/stigok/57d075c1cf2a609cb758898c0b202428
*/
