import { AgentExporter } from './exporters/agent.ts';
import { FileExporter } from './exporters/file.ts';

import { encode, heap, SourceMapper } from 'npm:@datadog/pprof';
import { ConsoleLogger } from './loggers/console.ts';
import { tagger } from './tagger.ts';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const logger = new ConsoleLogger();
const timeoutMs = 10 * 1000;

function exporterFromURL(url: { protocol: string }) {
  if (url.protocol === 'file:') {
    return new FileExporter({ pprofPrefix: fileURLToPath(url) });
  } else {
    return new AgentExporter({
      url,
      logger,
      uploadTimeout: timeoutMs,
    });
  }
}

async function exportProfile(urls, tags, profileType, profile) {
  let mapper;
  try {
    mapper = await SourceMapper.create([Deno.cwd()]);
  } catch (err) {
    logger.error(err);
  }

  const encodedProfile = await encode(heap.convertProfile(profile, undefined, mapper));
  const start = new Date();
  for (const url of urls) {
    const exporter = exporterFromURL(url);

    await exporter.export({
      profiles: {
        [profileType]: encodedProfile,
      },
      start,
      end: start,
      tags,
    });
  }
}

/** Expected command line arguments are:
 * - Comma separated list of URLs (eg. "http://127.0.0.1:8126/,file:///tmp/foo.pprof")
 * - Tags (eg. "service:nodejs_oom_test,version:1.0.0")
 * - Profiletype (eg. space,wall,cpu)
 * - JSON profile filepath
 */
const urls = Deno.args[0].split(',').map((s: string | URL) => new URL(s));
const tags = tagger.parse(Deno.args[1]);
const profileType = Deno.args[2];
const profile = JSON.parse(fs.readFileSync(Deno.args[3]));

exportProfile(urls, tags, profileType, profile);
