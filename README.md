---
services: key-vault
platforms: nodejs
author: balajikris
---

# Getting started with Key Vault in Node.js

This sample demonstrates how to create and manage a keyvault and interact with it in Node.js.

In this sample we create and provision a keyvault. We then interact with it by adding keys and secrets to it,
retreiving information from the key vault and finally, authorize an application to use a key or secret from the keyvault.

##### On this page:

- Run this sample
- What does index.js do?
- What does cleanup.js do?

### Run this sample

To run this sample:

1. If you don't already have it, get [node.js](https://nodejs.org)

2. Clone the repo: 

   `git clone https://github.com:Azure-Samples/keyvault-getting-started.git`

3. Install dependencies:
   ```
   cd keyvault-getting-started
   npm install
   ```
4. Create two Azure service principals, using 
    [Azure CLI](https://azure.microsoft.com/documentation/articles/resource-group-authenticate-service-principal-cli/),
    [PowerShell](https://azure.microsoft.com/documentation/articles/resource-group-authenticate-service-principal/)
    or [Azure Portal](https://azure.microsoft.com/documentation/articles/resource-group-create-service-principal-portal/).

    The second service principal will be needed to demonstrate how to authorize another entity to perform keyvault operations.

5. Set the following environment variables using the information from the service principal that you created.
    ```
    export AZURE_SUBSCRIPION_ID={your subscription id}
    export CLIENT_ID={your client id}
    export APPLICATION_SECRET={your client secret}
    export DOMAIN={your tenant id as a guid OR the domain name of your org <contosocorp.com>}
    export OBJECT_ID={Object id of the service principal}
    export SP_KEYVAULT_OPERATIONS={application id or Service principal of the app, that we want to authorize to interact with keyvault}
    export OBJECT_ID_KEYVAULT_OPERATIONS={Object id of the app, that we want to authorize to interact with keyvault}

    ```
   > [AZURE.NOTE] On Windows, use `set` instead of `export`.

6. Run the sample.

    `node index.js`

7. To clean up after index.js, run the cleanup script.

    `node cleanup.js <resourceGroupName> <keyVaultName>`

### What does index.js do?

The sample creates a new key vault, add a key and a secret to the vault, retreive keys and secrets from it, authorizes an app to use this keyvault's resources.

We start by logging in using your service principal and creating ResourceManagementClient and KeyVaultManagementClient objects. 
We then perform an authentication handshake with the KeyVault service before creating a KeyVaultClient object.

```
msRestAzure.loginWithServicePrincipalSecret(clientId, secret, domain, function (err, credentials) {
    if (err) return console.log(err);
    resourceClient = new ResourceManagementClient(credentials, subscriptionId);
    keyVaultManagementClient = new KeyVaultManagementClient(credentials, subscriptionId);

    var kvCredentials = new KeyVault.KeyVaultCredentials(authenticator);
    keyVaultClient = new KeyVault.KeyVaultClient(kvCredentials);
    ...
```

We then set up a resource group in which we will create the key vault resource.

```
  var groupParameters = { location: location, tags: { sampletag: 'sampleValue' } };
  return resourceClient.resourceGroups.createOrUpdate(resourceGroupName, groupParameters, callback);
```

The next step is to create and provision a key vault resource.

```
var keyPermissions = ['get', 'create', ...];
var keyVaultParameters = {
    location: location,
    properties: {...},
    tags: {}
};

keyVaultManagementClient.vaults.createOrUpdate(resourceGroupName, keyVaultName, keyVaultParameters, callback);
```

One a key vault has been provisioned, we interact with it by 

a. adding a key.

```
var attributes = { expires: new Date(...), notBefore: new Date(...) };
var keyOperations = ['encrypt', 'decrypt', ...];
var keyOptions = {
    keyOps: keyOperations,
    keyAttributes: attributes
};
var keyName = '<name>';

keyVaultClient.createKey(vaultUri, keyName, 'RSA', keyOptions, callback);
```

b. set a secret.

```
var attributes = { expires: new Date(...), notBefore: new Date(...) };
var secretOptions = {
    contentType: 'test secret',
    secretAttributes: attributes
};
var secretName = '<name>';
var secretValue = '<value>';

keyVaultClient.setSecret(vaultUri, secretName, secretValue, secretOptions, callback);
```

c. get all keys from the vault.

```
keyVaultClient.getKeys(vaultUri, callback);
```

d. get all secrets from the vault.

```
keyVaultClient.getSecrets(vaultUri, callback);
```

Finally, we authorize an app to interact with keyvault, by specifying an access policy.
To accomplish this, we first get the vault we created from the resource group using a `vaults.get` call.
We then call `createOrUpdate` on that vault, with updated parameters, which contains an additional `access policy`.
The `createOrUpdate` call will replace the parameters, so we copy the vault's original properties into our new 
`parameters` object and append a new `accessPolicyEntry` to it.

```
keyVaultManagementClient.vaults.get(resourceGroupName, keyVaultName,
    function (err, result, httpRequest, response) {
        var vault = result;

        var parameters = new keyVaultManagementClient.models.VaultCreateOrUpdateParameters();
        parameters.location = vault.location;
        parameters.properties = vault.properties;

        var newAccessPolicyEntry = {
            tenantId: domain,
            objectId: objectIdForKeyVault,
            applicationId: keyVaultSp,
            permissions: {
                keys: ['get', 'list', 'import'],
                secrets: ['all']
            }
        };

        parameters.properties.accessPolicies.push(newAccessPolicyEntry);

        keyVaultManagementClient.vaults.createOrUpdate(resourceGroupName, keyVaultName, parameters, callback);
    });
```

In case if we hit an error while executing these steps, we initiate an auto cleanup and exit.

```
console.log(`performing auto cleanup on error. deleting ${keyVaultName} and ${resourceGroupName}`);
cleanup(exit);
```

### What does cleanup.js do?

Running cleanup.js deletes the key vault that the sample created:
```
console.log('\nDeleting key vault : ' + keyVaultName);
return keyVaultManagementClient.vaults.deleteMethod(resourceGroupName, keyVaultName, callback);
```

It also deletes the resource group that the sample created:
```
console.log('\nDeleting resource group: ' + resourceGroupName);
return resourceClient.resourceGroups.deleteMethod(resourceGroupName, callback);
```

## More information

- [Azure SDK for Node.js](https://github.com/Azure/azure-sdk-for-node)
- [Azure KeyVault Documentation](https://azure.microsoft.com/en-us/documentation/services/key-vault/)