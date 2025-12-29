const path = require('node:path');
const crypto = require('node:crypto'); //require("crypto");
const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const { simpleGit, CleanOptions } = require('simple-git');
const { exec } = require('child_process');

dotenv.config();

const secret = process.env.WORD;

const sigHeaderName = "X-Hub-Signature-256";
const sigHashAlg = "sha256";

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
  await executeGitPull({repo: data?.repository?.full_name});
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


async function executeGitPull({repo}) {
  let git;
  switch (repo.toLowerCase()) {
    case 'bbohling/gh-wh-server':
      git = simpleGit(path.join(__dirname, '..', 'ghwh.brndn.me') );
      await git.pull();
      console.log('🥳 pull for bbohling/gh-wh-server success');
      break;
    case 'bbohling/jotreps-app':
      git = simpleGit(path.join(__dirname, '..', 'jotreps.com') );
      await git.pull();
      console.log('🥳 pull for bbohling/jotreps-app success');
      break;
    case 'brycebohling/mow':
      git = simpleGit(path.join(__dirname, '..', 'makerofworlds.dev') );
      await git.pull();
      console.log('🥳 pull for brycebohling/makerofworlds.dev success');
      break;
    case 'brycebohling/portfolio':
      git = simpleGit(path.join(__dirname, '..', 'brycebohling.com') );
      await git.pull();
      await git.raw('lfs', 'pull').catch(console.log);
      console.log('🥳 pull for brycebohling/portfolio success');
      break;
    case 'brycebohling/bullet-blitz':
      git = simpleGit(path.join(__dirname, '..', 'bulletblitz.brycebohling.com') );
      await git.pull();
      console.log('🥳 pull for brycebohling/bullet-blitz success');
      break;
    case 'brycebohling/crowdthought':
      git = simpleGit(path.join(__dirname, '..', 'ct.brycebohling.com') );
      await git.pull();
      console.log('🥳 pull for brycebohling/CrowdThought success');
      // Navigate to the client folder and run `npm run build`
      exec(
        `cd ${path.join(__dirname, '..', 'ct.brycebohling.com', 'client')} && npm run build`,
        (error, stdout, stderr) => {
          if (error) {
            console.error(`Error during npm run build: ${error.message}`);
            return;
          }
          if (stderr) {
            console.error(`stderr: ${stderr}`);
          }
          console.log(`stdout: ${stdout}`);
          console.log('🎉 npm run build for brycebohling/CrowdThought success');
        }
      );
      break;
    case 'brycebohling/dailyplant':
      git = simpleGit(path.join(__dirname, '..', 'advent.brycebohling.com') );
      await git.pull();
      console.log('🥳 pull for brycebohling/DailyPlant success');
      break;
    case 'brycebohling/gemjunction':
      git = simpleGit(path.join(__dirname, '..', 'gemjunction.brycebohling.com') );
      await git.pull();
      console.log('🥳 pull for brycebohling/GemJunction success');
      break;
    case 'brycebohling/magnet-game':
      git = simpleGit(path.join(__dirname, '..', 'mm.brycebohling.com') );
      await git.pull();
      console.log('🥳 pull for brycebohling/magnet-game success');
      break;
    default:
      console.log('sad trombone!', repo?.toLowerCase());
      break;
  }
  return;
}

/*
code largely from: https://gist.github.com/stigok/57d075c1cf2a609cb758898c0b202428
*/
