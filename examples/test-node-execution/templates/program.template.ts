const fs = require("fs");
const path = require("path");

async function main(): Promise<string> {
  const result = {
    fileExists: fs.existsSync(__filename),
    basename: path.basename(__filename),
    cwd: process.cwd()
  };

  return JSON.stringify(result, null, 2);
}

module.exports = main;
