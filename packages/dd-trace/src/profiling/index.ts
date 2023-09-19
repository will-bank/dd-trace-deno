import { Profiler, ServerlessProfiler } from './profiler.ts';
import WallProfiler from './profilers/wall.ts';
import SpaceProfiler from './profilers/space.ts';
import { AgentExporter } from './exporters/agent.ts';
import { FileExporter } from './exporters/file.ts';
import { ConsoleLogger } from './loggers/console.ts';

const profiler = Deno.env.get('AWS_LAMBDA_FUNCTION_NAME') ? new ServerlessProfiler() : new Profiler();

export { AgentExporter, ConsoleLogger, FileExporter, profiler, SpaceProfiler, WallProfiler };
