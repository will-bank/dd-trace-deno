import log from '../log/index.ts';
import * as blockedTemplates from './blocked_templates.ts';

let templateHtml = blockedTemplates.html;
let templateJson = blockedTemplates.json;
let blockingConfiguration;

function blockWithRedirect(
  res:
    | { writeHead: (arg0: any, arg1: { Location: any }) => { (): any; new (): any; end: { (): void; new (): any } } }
    | { headersSent: any },
  rootSpan: { addTags: (arg0: { 'appsec.blocked': string }) => void },
  abortController: { abort: () => void },
) {
  rootSpan.addTags({
    'appsec.blocked': 'true',
  });

  let statusCode = blockingConfiguration.parameters.status_code;
  if (!statusCode || statusCode < 300 || statusCode >= 400) {
    statusCode = 303;
  }

  res.writeHead(statusCode, {
    'Location': blockingConfiguration.parameters.location,
  }).end();

  if (abortController) {
    abortController.abort();
  }
}

function blockWithContent(
  req: { headers: { accept: string } },
  res: { statusCode: number; setHeader: (arg0: string, arg1: string) => void; end: (arg0: any) => void } | {
    headersSent: any;
  },
  rootSpan: { addTags: (arg0: { 'appsec.blocked': string }) => void },
  abortController: { abort: () => void },
) {
  let type;
  let body;

  // parse the Accept header, ex: Accept: text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8
  const accept = req.headers.accept && req.headers.accept.split(',').map((str: string) => str.split(';', 1)[0].trim());

  if (!blockingConfiguration || blockingConfiguration.parameters.type === 'auto') {
    if (accept && accept.includes('text/html') && !accept.includes('application/json')) {
      type = 'text/html; charset=utf-8';
      body = templateHtml;
    } else {
      type = 'application/json';
      body = templateJson;
    }
  } else {
    if (blockingConfiguration.parameters.type === 'html') {
      type = 'text/html; charset=utf-8';
      body = templateHtml;
    } else {
      type = 'application/json';
      body = templateJson;
    }
  }

  rootSpan.addTags({
    'appsec.blocked': 'true',
  });

  if (
    blockingConfiguration && blockingConfiguration.type === 'block_request' &&
    blockingConfiguration.parameters.status_code
  ) {
    res.statusCode = blockingConfiguration.parameters.status_code;
  } else {
    res.statusCode = 403;
  }
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);

  if (abortController) {
    abortController.abort();
  }
}

function block(
  req: { headers: { accept: string } },
  res: { headersSent: any },
  rootSpan: {
    addTags: ((arg0: { 'appsec.blocked': string }) => void) | ((arg0: { 'appsec.blocked': string }) => void);
  },
  abortController: { abort: (() => void) | (() => void) },
) {
  if (res.headersSent) {
    log.warn('Cannot send blocking response when headers have already been sent');
    return;
  }

  if (
    blockingConfiguration && blockingConfiguration.type === 'redirect_request' &&
    blockingConfiguration.parameters.location
  ) {
    blockWithRedirect(res, rootSpan, abortController);
  } else {
    blockWithContent(req, res, rootSpan, abortController);
  }
}

function setTemplates(config: { appsec: { blockedTemplateHtml: any; blockedTemplateJson: any } }) {
  if (config.appsec.blockedTemplateHtml) {
    templateHtml = config.appsec.blockedTemplateHtml;
  }
  if (config.appsec.blockedTemplateJson) {
    templateJson = config.appsec.blockedTemplateJson;
  }
}

function updateBlockingConfiguration(newBlockingConfiguration) {
  blockingConfiguration = newBlockingConfiguration;
}

export { block, setTemplates, updateBlockingConfiguration };
