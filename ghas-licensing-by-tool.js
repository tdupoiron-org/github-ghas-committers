import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import minimist from "minimist";

async function main() {
  const OctokitWithThrottling = Octokit.plugin(throttling);

  const octokit = new OctokitWithThrottling({
    auth: process.env.GITHUB_TOKEN,
    baseUrl: process.env.GITHUB_BASE_URL,
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(
          `Request quota exhausted for request ${options.method} ${options.url}`
        );

        if (retryCount < 1) {
          // only retries once
          octokit.log.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        // does not retry, only logs a warning
        octokit.log.warn(
          `SecondaryRateLimit detected for request ${options.method} ${options.url}`
        );
      },
    },
  });

  const argv = minimist(process.argv.slice(2), {
    string: ["enterprise", "org"],
    boolean: ["help"],
    boolean: ["verbose"],
    alias: {
      e: "enterprise",
      o: "org",
      h: "help",
      v: "verbose",
    },
  });

  if (argv.help || !argv.enterprise) {
    console.log(
      "Usage: node ghas-licensing-by-tool.js --enterprise <enterprise> [--org <organization>]"
    );
    console.log(
      "Example: node ghas-licensing-by-tool.js --enterprise my-enterprise --org my-org"
    );
    process.exit(1);
  }

  const enterprise = argv.enterprise;

  octokit.log.warn = () => {};
  octokit.log.error = () => {};

  // get the stats for the enterprise
  const stats = await octokit.request(
    "GET /enterprises/{enterprise}/settings/billing/advanced-security",
    {
      enterprise: enterprise,
    }
  );

  const totalActiveCommitters = stats.data.total_advanced_security_committers;
  const maxActiveCommitters = stats.data.maximum_advanced_security_committers;
  const purchasedCommitters = stats.data.purchased_advanced_security_committers;

  console.log(`Total active committers: ${totalActiveCommitters}`);
  console.log(`Max active committers: ${maxActiveCommitters}`);
  console.log(`Purchased committers: ${purchasedCommitters}`);
  console.log();

  // now get the list of repos and which committers are active
  const repos = await octokit.paginate(
    "GET /enterprises/{enterprise}/settings/billing/advanced-security",
    {
      enterprise: enterprise,
      per_page: 100,
    }
  );

  const secretProtectionCommitters = new Set();
  const codeScanningCommitters = new Set();

  // filter repos by org name if org parameter is provided
  const filteredRepos = argv.org
    ? repos.filter((repo) => repo.name.startsWith(`${argv.org}/`))
    : repos;

  // log number of repos
  console.log(`Number of repos: ${filteredRepos.length}`);
  console.log();

  let successfullyProcessed = 0;

  for (const repo_data of filteredRepos) {
    if (argv.verbose) {
      console.log(`Repo ${filteredRepos.indexOf(repo_data) + 1}: ${repo_data.name}`);
    }

    const name = repo_data.name;
    const committers = repo_data.advanced_security_committers_breakdown;
    const [owner, repo] = name.split("/");

    // Skip if org parameter is provided and doesn't match
    if (argv.org && owner !== argv.org) {
      if (argv.verbose) {
        continue;
      }
      continue;
    }

    let secretProtectionEnabled = false;
    let codeScanningEnabled = false;

    // check for Code Security configurations attached to the repo
    try {

        const config = await octokit.request(
            `GET /repos/${owner}/${repo}/code-security-configuration`, {
                owner: owner,
                repo: repo,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            }
        );

        if (config.data.status === "attached") {
            if (config.data.configuration.secret_scanning === "enabled") {
                secretProtectionEnabled = true;
            }
            if (config.data.configuration.code_scanning_default_setup === "enabled") {
                codeScanningEnabled = true;
            }
        }

        successfullyProcessed++;

    } catch (error) {
      // log error
      if (argv.verbose) {
        console.log(`Error fetching code security configuration for ${name}`);
      }
      continue;
    }

    if (!secretProtectionEnabled) {
        // query API for this repo, to get which security tools are enabled in the security_and_analysis field
        const repoSettings = await octokit.repos.get({
        owner: name.split("/")[0],
        repo: name.split("/")[1],
        });

        if (repoSettings.status !== 200) {
        console.log(`Error fetching repo settings for ${name}`);
        continue;
        }

        const securityAndAnalysis = repoSettings.data.security_and_analysis;
        if (securityAndAnalysis.secret_scanning.status === "enabled") {
            secretProtectionEnabled = true;
        }
    }

    if (secretProtectionEnabled) {
        committers.forEach((committer) => {
            secretProtectionCommitters.add(committer.user_login);
        });
    }

    if (!codeScanningEnabled) {
        // query for Code Scanning analyses - don't need them all, just seeing if any exist
        try {
        const analyses = await octokit.rest.codeScanning.listRecentAnalyses({
            owner,
            repo,
        });

        if (analyses?.data?.length > 0) {
            codeScanningEnabled = true;
        }
        } catch (error) {
        continue;
        }
    }

    if (codeScanningEnabled) {
        committers.forEach((committer) => {
            codeScanningCommitters.add(committer.user_login);
        });
    }
  }

  // convert sets to arrays for easier manipulation
  const secretProtectionArray = Array.from(secretProtectionCommitters);
  const codeScanningArray = Array.from(codeScanningCommitters);

  // output total unique active commmitters for each tool
  console.log();
  console.log(`Successfully processed repositories: ${successfullyProcessed} out of ${filteredRepos.length}`);

  console.log(`Secret protection: ${secretProtectionArray.length}`);
  console.log(`Code security: ${codeScanningArray.length}`);

  if (argv.verbose) {
    console.log("Secret protection committers:");
    secretProtectionArray.sort().forEach((committer) => {
      console.log(` - ${committer}`);
    });

    console.log("Code scanning committers:");
    codeScanningArray.sort().forEach((committer) => {
      console.log(` - ${committer}`);
    });
  }
}

await main();