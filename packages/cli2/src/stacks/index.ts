import path from "path";
import { build } from "./build.js";
import { deploy, deployMany } from "./deploy.js";
import { App } from "@serverless-stack/resources";
import { useAWSProvider, useSTSIdentity } from "../credentials/index.js";
import { useProjectRoot, useConfig } from "../config/index.js";
import { useBootstrap } from "../bootstrap/index.js";
import { Logger } from "../logger/index.js";
import { useStateDirectory } from "../state/index.js";
import { CloudExecutable } from "aws-cdk/lib/api/cxapp/cloud-executable.js";
import { Configuration } from "aws-cdk/lib/settings.js";

interface SynthOptions {
  buildDir?: string;
  outDir?: string;
  skipBuild?: boolean;
  fn: (app: App) => Promise<void> | void;
}

async function synth(opts: SynthOptions) {
  Logger.debug("Synthesizing stacks...");
  opts = {
    buildDir: ".sst/out",
    ...opts
  };
  const [identity, config, bootstrap] = await Promise.all([
    useSTSIdentity(),
    useConfig(),
    useBootstrap()
  ]);

  const cfg = new Configuration();
  await cfg.load();
  const app = new App(
    {
      account: identity.Account!,
      stage: config.stage,
      name: config.name,
      region: config.region,
      skipBuild: opts.skipBuild || false,
      bootstrapAssets: {
        bucketName: bootstrap.bucket,
        version: bootstrap.version,
        stackName: bootstrap.stack
      }
    },
    {
      outdir: opts.buildDir || path.join(await useStateDirectory(), "out"),
      context: cfg.context.all
    }
  );

  await opts.fn(app);
  await app.runDeferredBuilds();
  /*
  console.log(JSON.stringify(cfg.context));
  const executable = new CloudExecutable({
    sdkProvider: await useAWSProvider(),
    configuration: cfg,
    synthesizer: async () => app.synth() as any
  });
  const { assembly } = await executable.synthesize(true);
  */
  const assembly = app.synth();
  await cfg.saveContext();
  console.log(assembly.manifest.missing);
  Logger.debug("Finished synthesizing");
  return assembly;
}

export const Stacks = {
  build,
  deploy,
  deployMany,
  synth
};
