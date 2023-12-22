import InjectionAnalyzer from './injection-analyzer.ts';
import { COMMAND_INJECTION } from '../vulnerabilities.ts';

class CommandInjectionAnalyzer extends InjectionAnalyzer {
  constructor() {
    super(COMMAND_INJECTION);
  }

  onConfigure() {
    this.addSub('datadog:child_process:execution:start', ({ command }) => this.analyze(command));
  }
}

export default new CommandInjectionAnalyzer();
