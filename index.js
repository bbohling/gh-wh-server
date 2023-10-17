const crypto = require("crypto");
const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");

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
  let sig =
    "sha1=" +
    crypto.createHmac("sha1", secret).update(chunk.toString()).digest("hex");
  res.send("whatev");
});

app.post("/fish", verifyPostData, function (req, res) {
  let data = req.body;
  console.log("data", data);
  // const jsonResponse = JSON.parse(data);
  console.log("repo", data.repository.full_name);
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

/*
code largely from: https://gist.github.com/stigok/57d075c1cf2a609cb758898c0b202428
*/
