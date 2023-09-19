import * as request from '../../exporters/common/request.ts';
import * as id from '../../id.ts';

function getItrConfiguration({
  url,
  isEvpProxy,
  env,
  service,
  repositoryUrl,
  sha,
  osVersion,
  osPlatform,
  osArchitecture,
  runtimeName,
  runtimeVersion,
  branch,
  custom,
}, done) {
  const options = {
    path: '/api/v2/libraries/tests/services/setting',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    url,
  };

  if (isEvpProxy) {
    options.path = '/evp_proxy/v2/api/v2/libraries/tests/services/setting';

    options.headers['X-Datadog-EVP-Subdomain'] = 'api';

    options.headers['X-Datadog-NeedsAppKey'] = 'true';
  } else {
    const apiKey = Deno.env.get('DATADOG_API_KEY') || Deno.env.get('DD_API_KEY');
    const appKey = Deno.env.get('DATADOG_APP_KEY') ||
      Deno.env.get('DD_APP_KEY') ||
      Deno.env.get('DATADOG_APPLICATION_KEY') ||
      Deno.env.get('DD_APPLICATION_KEY');

    const messagePrefix = 'Request to settings endpoint was not done because Datadog';

    if (!appKey) {
      return done(new Error(`${messagePrefix} application key is not defined.`));
    }
    if (!apiKey) {
      return done(new Error(`${messagePrefix} API key is not defined.`));
    }

    options.headers['dd-api-key'] = apiKey;

    options.headers['dd-application-key'] = appKey;
  }

  const data = JSON.stringify({
    data: {
      id: id().toString(10),
      type: 'ci_app_test_service_libraries_settings',
      attributes: {
        test_level: 'suite',
        configurations: {
          'os.platform': osPlatform,
          'os.version': osVersion,
          'os.architecture': osArchitecture,
          'runtime.name': runtimeName,
          'runtime.version': runtimeVersion,
          custom,
        },
        service,
        env,
        repository_url: repositoryUrl,
        sha,
        branch,
      },
    },
  });

  request(data, options, (err, res: string) => {
    if (err) {
      done(err);
    } else {
      try {
        const {
          data: {
            attributes: {
              code_coverage: isCodeCoverageEnabled,
              tests_skipping: isSuitesSkippingEnabled,
            },
          },
        } = JSON.parse(res);

        done(null, { isCodeCoverageEnabled, isSuitesSkippingEnabled });
      } catch (err) {
        done(err);
      }
    }
  });
}

export { getItrConfiguration };
