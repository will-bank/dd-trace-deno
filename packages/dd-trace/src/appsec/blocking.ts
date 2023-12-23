import * as blockedTemplates from './blocked_templates.ts';

let templateHtml = blockedTemplates.html;
let templateJson = blockedTemplates.json;
let blockingConfiguration = {};

function blockWithRedirect(
  rootSpan: { addTags: (arg0: { 'appsec.blocked': string }) => void },
  abortController?: AbortController,
) {
  rootSpan.addTags({
    'appsec.blocked': 'true',
  });

  let statusCode = blockingConfiguration.parameters.status_code;
  if (!statusCode || statusCode < 300 || statusCode >= 400) {
    statusCode = 303;
  }

  abortController?.abort();

  return Response.redirect(blockingConfiguration.parameters.location, statusCode);
}

function blockWithContent(
  req: Request,
  rootSpan: { addTags: (arg0: { 'appsec.blocked': string }) => void },
  abortController?: AbortController,
) {
  let type;
  let body;

  // parse the Accept header, ex: Accept: text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8
  const accept = req.headers.get('accept')?.split(',').map((str: string) => str.split(';', 1)[0].trim());

  if (blockingConfiguration.parameters.type === 'auto') {
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

  abortController?.abort();

  const statusCode = blockingConfiguration.type === 'block_request' && blockingConfiguration.parameters.status_code
    ? blockingConfiguration.parameters.status_code
    : 403;

  return new Response(
    new Blob([body], { type }),
    {
      status: statusCode,
    },
  );
}

function block(
  req: Request,
  rootSpan: {
    addTags: ((arg0: { 'appsec.blocked': string }) => void) | ((arg0: { 'appsec.blocked': string }) => void);
  },
  abortController?: AbortController,
) {
  if (
    blockingConfiguration.type === 'redirect_request' &&
    blockingConfiguration.parameters.location
  ) {
    return blockWithRedirect(rootSpan, abortController);
  }

  return blockWithContent(req, rootSpan, abortController);
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
