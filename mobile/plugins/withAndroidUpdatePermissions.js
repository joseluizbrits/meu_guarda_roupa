const { withAndroidManifest } = require('@expo/config-plugins');

const REQUEST_INSTALL_PACKAGES_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';
const INSTALL_PACKAGE_INTENT_ACTION = 'android.intent.action.INSTALL_PACKAGE';

function addInstallPermissionAndQueries(androidManifest) {
  // Ensure manifest and its properties exist
  if (!androidManifest.manifest) {
    androidManifest.manifest = {};
  }
  const manifest = androidManifest.manifest;

  // Initialize arrays if they don't exist
  if (!manifest['uses-permission']) {
    manifest['uses-permission'] = [];
  }
  if (!manifest.queries) {
    manifest.queries = [];
  }

  // Add REQUEST_INSTALL_PACKAGES permission
  const hasInstallPermission = manifest['uses-permission'].some(
    (p) => p.$ && p.$['android:name'] === REQUEST_INSTALL_PACKAGES_PERMISSION
  );

  if (!hasInstallPermission) {
    manifest['uses-permission'].push({
      $: { 'android:name': REQUEST_INSTALL_PACKAGES_PERMISSION },
    });
  }

  // Add queries for INSTALL_PACKAGE intent
  const hasInstallQuery = manifest.queries.some((q) =>
    q.intent?.some((i) => i.action?.some((a) => a.$ && a.$['android:name'] === INSTALL_PACKAGE_INTENT_ACTION))
  );

  if (!hasInstallQuery) {
    manifest.queries.push({
      intent: [
        {
          action: [{ $: { 'android:name': INSTALL_PACKAGE_INTENT_ACTION } }],
        },
      ],
    });
  }

  return androidManifest;
}

function ensureFileProvider(androidManifest, applicationId) {
  const manifest = androidManifest.manifest;
  
  // Ensure application exists as array
  if (!manifest.application || !Array.isArray(manifest.application)) {
    manifest.application = [{}];
  }
  const application = manifest.application[0];

  const providerName = 'androidx.core.content.FileProvider';
  const authority = `${applicationId}.fileprovider`;

  // Initialize provider array
  if (!application.provider) {
    application.provider = [];
  }

  // Check if FileProvider already exists
  const existingProvider = application.provider.find(
    (p) => p.$ && p.$['android:name'] === providerName && p.$['android:authorities'] === authority
  );

  if (existingProvider) {
    console.log('[withAndroidUpdatePermissions] FileProvider already exists');
    return androidManifest;
  }

  console.log('[withAndroidUpdatePermissions] Adding FileProvider for', authority);

  // Add FileProvider
  application.provider.push({
    $: {
      'android:name': providerName,
      'android:authorities': authority,
      'android:exported': 'false',
      'android:grantUriPermissions': 'true',
    },
    'meta-data': [
      {
        $: {
          'android:name': 'android.support.FILE_PROVIDER_PATHS',
          'android:resource': '@xml/filepaths',
        },
      },
    ],
  });

  return androidManifest;
}

function withAndroidUpdatePermissions(config) {
  const applicationId = config.android?.package || 'com.rafaelferro.meuguardaroupa';

  return withAndroidManifest(config, (androidManifest) => {
    console.log('[withAndroidUpdatePermissions] Running plugin (main)');
    let manifest = addInstallPermissionAndQueries(androidManifest);
    manifest = ensureFileProvider(manifest, applicationId);
    console.log('[withAndroidUpdatePermissions] Final manifest uses-permission:', JSON.stringify(manifest.manifest?.['uses-permission']?.map(p => p.$?.['android:name']), null, 2));
    console.log('[withAndroidUpdatePermissions] Final manifest queries:', JSON.stringify(manifest.manifest?.queries, null, 2));
    console.log('[withAndroidUpdatePermissions] Final manifest providers:', JSON.stringify(manifest.manifest?.application?.[0]?.provider?.map(p => p.$?.['android:name']), null, 2));
    return manifest;
  });
}

// Also export a function that can be used to add the queries after other plugins
function addInstallPackageQuery(config) {
  return withAndroidManifest(config, (androidManifest) => {
    console.log('[withAndroidUpdatePermissions] Running addInstallPackageQuery plugin');
    const manifest = androidManifest.manifest;
    if (!manifest.queries) {
      manifest.queries = [];
    }
    
    const hasInstallQuery = manifest.queries.some((q) =>
      q.intent?.some((i) => i.action?.some((a) => a.$ && a.$['android:name'] === INSTALL_PACKAGE_INTENT_ACTION))
    );
    
    console.log('[withAndroidUpdatePermissions] addInstallPackageQuery - hasInstallQuery:', hasInstallQuery);
    console.log('[withAndroidUpdatePermissions] addInstallPackageQuery - current queries:', JSON.stringify(manifest.queries, null, 2));

    if (!hasInstallQuery) {
      manifest.queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': INSTALL_PACKAGE_INTENT_ACTION } }],
          },
        ],
      });
      console.log('[withAndroidUpdatePermissions] addInstallPackageQuery - added query');
    }
    return androidManifest;
  });
}

module.exports = withAndroidUpdatePermissions;
module.exports.addInstallPackageQuery = addInstallPackageQuery;