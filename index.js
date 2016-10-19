/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */
'use strict';

var util = require('util');
var async = require('async');
var msRestAzure = require('ms-rest-azure');
var ResourceManagementClient = require('azure-arm-resource').ResourceManagementClient;
var KeyVaultManagementClient = require('azure-arm-keyvault')
var KeyVault = require('azure-keyvault');
var AuthenticationContext = require('adal-node').AuthenticationContext;

//Sample Config
var randomIds = {};
var location = 'westus';
var resourceGroupName = _generateRandomId('testrg', randomIds);
var keyVaultName = _generateRandomId('testkv', randomIds);

_validateEnvironmentVariables();

var clientId = process.env['CLIENT_ID']; // service principal
var domain = process.env['DOMAIN']; // tenant id
var secret = process.env['APPLICATION_SECRET'];
var subscriptionId = process.env['AZURE_SUBSCRIPTION_ID'];
var objectId = process.env['OBJECT_ID'];
var objectIdForKeyVault = process.env['OBJECT_ID_KEYVAULT_OPERATIONS'];

var resourceClient, keyVaultManagementClient, keyVaultClient;

msRestAzure.loginWithServicePrincipalSecret(clientId, secret, domain, function (err, credentials) {
    if (err) return console.log(err);
    resourceClient = new ResourceManagementClient(credentials, subscriptionId);
    keyVaultManagementClient = new KeyVaultManagementClient(credentials, subscriptionId);

    var kvCredentials = new KeyVault.KeyVaultCredentials(authenticator);
    keyVaultClient = new KeyVault.KeyVaultClient(kvCredentials);

    // Work flow of this sample:
    // Setup: Create a resource group
    // 1. create a keyvault
    // 2. add a key to the keyvault
    // 3. get key from vault
    // 4. add a secret to vault
    // 5. get secrets from vault
    // 6. authorize an app to use key or secret.
    // cleanup: delete keyvault.

    async.waterfall([
        function (callback) {
            // Setup
            createResourceGroup(function (err, result, request, response) {
                if (err) {
                    return callback(err);
                }
                callback(null);
            });
        },
        function (callback) {
            // 1. create a keyvault
            createKeyVault(function (err, result, request, response) {
                if (err) {
                    return callback(err);
                }
                console.log('\n #create key vault result is: \n' + util.inspect(result, { depth: null }));

                // Note: 
                // proceed after a timeout.The reason of this is, keyvault is a network resource
                // and DNS registration takes some time. After talking with the keyvault team,
                // a delay of 5 seconds seems to be sufficient.
                // this is a temporary workaround, while we address the issue in Node SDK
                // see: https://github.com/Azure/azure-sdk-for-node/pull/1938
                setTimeout(function () {
                    callback(null, result.properties.vaultUri);
                }, 5000);
            });
        },
        function (vaultUri, callback) {
            // 2. add a key to the vault
            createKey(vaultUri, function (err, result, request, response) {
                if (err) {
                    return callback(err);
                }
                console.log('\n #create key result is: \n' + util.inspect(result, { depth: null }));
                callback(null, vaultUri);
            });
        },
        function (vaultUri, callback) {
            // 3. get key from vault.
            getKeys(vaultUri, function (err, result, request, response) {
                if (err) {
                    return callback(err);
                }
                console.log('\n #retreived keys from vault: \n' + util.inspect(result, { depth: null }));
                callback(null, vaultUri);
            });
        },
        function (vaultUri, callback) {
            // 4. set secret
            setSecret(vaultUri, function (err, result, request, response) {
                if (err) {
                    return callback(err);
                }
                console.log('\n #set secret in vault: \n' + util.inspect(result, { depth: null }));
                callback(null, vaultUri);
            });
        },
        function (vaultUri, callback) {
            // 5. get secret
            getSecrets(vaultUri, function (err, result, request, response) {
                if (err) {
                    return callback(err);
                }
                console.log('\n #get secrets in vault: \n' + util.inspect(result, { depth: null }));
                callback(null, vaultUri);
            });
        },
        function (vaultUri, callback) {
            // 6. authorize an app in keyvault
            updateKeyVault(function (err, result, request, response) {
                if (err) {
                    return callback(err);
                }
                console.log('\n #update keyvault result is: \n' + util.inspect(result, { depth: null }));
                callback(null);
            });
        },
    ],

        // Once above operations finish, cleanup and exit.
        function (err, results) {
            console.log('\n###### Exit ######\n')

            if (err) {
                console.log(util.format('\n??????Error occurred in one of the operations.\n%s',
                    util.inspect(err, { depth: null })));

                console.log(`performing auto cleanup on error. deleting ${keyVaultName} and ${resourceGroupName}`);
                cleanup(exit);
            }
            else {
                console.log(util.format('Please execute the following script for cleanup:\nnode cleanup.js %s %s', resourceGroupName, keyVaultName));
                exit();
            }
        });
});

// Helpers for interacting with keyvault.

function createResourceGroup(callback) {
    var groupParameters = { location: location, tags: { sampletag: 'sampleValue' } };
    console.log('\nCreating resource group: ' + resourceGroupName);
    return resourceClient.resourceGroups.createOrUpdate(resourceGroupName, groupParameters, callback);
}

function authenticator(challenge, callback) {
    // Create a new authentication context.
    var context = new AuthenticationContext(challenge.authorization);

    // Use the context to acquire an authentication token.
    return context.acquireTokenWithClientCredentials(challenge.resource, clientId, secret, function (err, tokenResponse) {
        if (err) throw err;
        // Calculate the value to be set in the request's Authorization header and resume the call.
        var authorizationValue = tokenResponse.tokenType + ' ' + tokenResponse.accessToken;

        return callback(null, authorizationValue);
    });
}

function createKeyVault(callback) {
    var keyPermissions = ['get', 'create', 'delete', 'list', 'update', 'import', 'backup', 'restore'];
    var keyVaultParameters = {
        location: location,
        properties: {
            sku: {
                name: 'standard',
            },
            accessPolicies: [
                {
                    tenantId: domain,
                    objectId: objectId,
                    permissions: {
                        keys: keyPermissions,
                        secrets: ['all']
                    }
                }
            ],
            enabledForDeployment: false,
            tenantId: domain
        },
        tags: {}
    };

    console.log('\nCreating key vault: ' + keyVaultName);
    keyVaultManagementClient.vaults.createOrUpdate(resourceGroupName, keyVaultName, keyVaultParameters, callback);
}

function createKey(vaultUri, callback) {
    var attributes = { expires: new Date('2050-02-02T08:00:00.000Z'), notBefore: new Date('2016-01-01T08:00:00.000Z') };
    var keyOperations = ['encrypt', 'decrypt', 'sign', 'verify', 'wrapKey', 'unwrapKey'];
    var keyOptions = {
        keyOps: keyOperations,
        keyAttributes: attributes
    };
    var keyName = 'testkeyrandom99';

    console.log(`\n creating key ${keyName} in ${vaultUri}`);
    keyVaultClient.createKey(vaultUri, keyName, 'RSA', keyOptions, callback);
}

function updateKeyVault(callback) {
    keyVaultManagementClient.vaults.get(resourceGroupName, keyVaultName,
        function (err, result, httpRequest, response) {
            var vault = result;

            var parameters = new keyVaultManagementClient.models.VaultCreateOrUpdateParameters();
            parameters.location = vault.location;
            parameters.properties = vault.properties;

            var newAccessPolicyEntry = {
                tenantId: domain,
                objectId: objectIdForKeyVault,
                permissions: {
                    keys: ['get', 'list', 'import'],
                    secrets: ['all']
                }
            };

            parameters.properties.accessPolicies.push(newAccessPolicyEntry);

            console.log(`\n updating key vault ${keyVaultName} w/ new access policy entry`);
            keyVaultManagementClient.vaults.createOrUpdate(resourceGroupName, keyVaultName, parameters, callback);
        });
}

function getKeys(vaultUri, callback) {
    console.log(`\n getting all keys in ${vaultUri}`);
    keyVaultClient.getKeys(vaultUri, callback);
}

function setSecret(vaultUri, callback) {
    console.log(`\n setting a secret in ${vaultUri}`);
    var attributes = { expires: new Date('2050-02-02T08:00:00.000Z'), notBefore: new Date('2016-01-01T08:00:00.000Z') };
    var secretOptions = {
        contentType: 'test secret',
        secretAttributes: attributes
    };
    var secretName = 'mysecret';
    var secretValue = 'my shared secret';

    keyVaultClient.setSecret(vaultUri, secretName, secretValue, secretOptions, callback);
}

function getSecrets(vaultUri, callback) {
    console.log(`\n getting all secrets in ${vaultUri}`);
    keyVaultClient.getSecrets(vaultUri, callback);
}

function cleanup(callback) {
    console.log('\nDeleting key vault : ' + keyVaultName);
    keyVaultManagementClient.vaults.deleteMethod(resourceGroupName, keyVaultName,
        function (err, result, request, response) {
            console.log('\nDeleting resource group: ' + resourceGroupName);
            resourceClient.resourceGroups.deleteMethod(resourceGroupName,
                function (err, result, request, response) {
                    console.log('\nDone clean up, exiting');
                    callback();
                });
        });
}

function exit() {
    console.log('press any key to exit');

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', process.exit.bind(process, 0));
}

function _validateEnvironmentVariables() {
    var envs = [];
    if (!process.env['CLIENT_ID']) envs.push('CLIENT_ID');
    if (!process.env['DOMAIN']) envs.push('DOMAIN');
    if (!process.env['APPLICATION_SECRET']) envs.push('APPLICATION_SECRET');
    if (!process.env['AZURE_SUBSCRIPTION_ID']) envs.push('AZURE_SUBSCRIPTION_ID');
    if (!process.env['OBJECT_ID']) envs.push('OBJECT_ID');
    if (!process.env['OBJECT_ID_KEYVAULT_OPERATIONS']) envs.push('OBJECT_ID_KEYVAULT_OPERATIONS');

    if (envs.length > 0) {
        throw new Error(util.format('please set/export the following environment variables: %s', envs.toString()));
    }
}

function _generateRandomId(prefix, existingIds) {
    var newNumber;
    while (true) {
        newNumber = prefix + Math.floor(Math.random() * 10000);
        if (!existingIds || !(newNumber in existingIds)) {
            break;
        }
    }
    return newNumber;
}