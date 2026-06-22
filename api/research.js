const { handleResearchRequest, loadDotEnv, sendJson } = require("../lib/backend");

loadDotEnv(process.cwd());

module.exports = async (request, response) => {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  await handleResearchRequest(request, response);
};
