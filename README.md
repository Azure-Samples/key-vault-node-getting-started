---
services: key-vault
platforms: nodejs
author: balajikris
---

# Getting started with Key Vault in Node.js

This sample demonstrates how to create and manage a keyvault and interact with it in Node.js. We will also write an app
that consumes information from the key vault.

### Introduction

In this sample

(a) We will learn how to create and manage a keyvault. we will perform operations on it like storing and retrieving keys and secrets.
Finally, we will authorize an application and give it permissions to interact with the vault.

(b) we will write a weather application that talks to the [openweathermap api](http://openweathermap.org/current) to retrieve the current weather data for a given city.
The app will need an API key to make the call, which we would store in the key vault we provisioned in the above step and fetch from the app.

##### On this page:

- [How to run this sample](#how-to-run-this-sample)
- [Understanding what index.js does](#understanding-what-index-js-does)
- [Understanding what weather-app.js does](#understanding-what-weather-app-js-does)
- [Understanding what cleanup.js does](#understanding-what-cleanup-js-does)

### how to run this sample

To run this sample:

1. If you don't already have it, get [node.js](https://nodejs.org)

2. Clone the repo: 

   `git clone https://github.com/Azure-Samples/key-vault-node-getting-started.git`

3. Install dependencies:
   ```
   cd key-vault-node-getting-started
   npm install
   ```

4. Create an Azure service principals, using 
    [Azure CLI](https://azure.microsoft.com/documentation/articles/resource-group-authenticate-service-principal-cli/),
    [PowerShell](https://azure.microsoft.com/documentation/articles/resource-group-authenticate-service-principal/)
    or [Azure Portal](https://azure.microsoft.com/documentation/articles/resource-group-create-service-principal-portal/).

    This service principal is to run the sample on your azure account.

5. Create another Azure service principal using Azure Portal.

    We will authorize this service principal to access key vault. In this service principal, from the azure portal,
    create a new key and save it. note down the key value upon hitting save.
    Also, note down the application id and the object id for the service prinicipals, we would use them later.

6. Set the following environment variables using the information from the service principal that you created.

    ```
    export AZURE_SUBSCRIPION_ID={your subscription id}
    export CLIENT_ID={your client id}
    export APPLICATION_SECRET={your client secret}
    export DOMAIN={your tenant id as a guid OR the domain name of your org <contosocorp.com>}
    export OBJECT_ID={Object id of the service principal}
    
    export SP_KEYVAULT_OPERATIONS={application id of the app, that we want to authorize to interact with keyvault, created in step 5}
    export OBJECT_ID_KEYVAULT_OPERATIONS={Object id of the app, that we want to authorize to interact with keyvault, created in step 5}
    export WEATHER_APP_KEY={key value that we noted down in step 5}

    export KEYVAULT_SECRET_NAME=open-weather-map-key
    ```
   > [AZURE.NOTE] On Windows, use `set` instead of `export`.

7. Run the sample.

    (a) First we need to provision a key vault resource and authorize an app to use it.

    Execute `node index.js`

    (b) Then, get an API key from [openweathermap](http://openweathermap.org/) and securely store it in key vault like so

    From xplat-cli run `azure keyvault secret set --vault-name "<key vault name>" --secret-name "open-weather-map-key" "<api key>"`

    Alternatively, you can accomplish this from the Azure portal as well. 
    
    > Note: 
    > 
    > you should be logged in with a service principal that has access to the key vault resource
    > 
    > the secret-name should match the environment variable (KEYVAULT_SECRET_NAME) exported in step 6 above and is also used in weather-app.js.

    (c) Finally, we run an app that displays current weather conditions for a given city.

    Execute `node weather-app.js <key vault name> <city>`

    arguments passed in:

    key vault name: not the whole url, just the name from https://&lt;vaultName&gt;.vault.azure.net/

    city: format is <city name, country name/code> e.g: `redmond, us` or `London, uk`. country is optional but it helps in disambiguating city name.

8. To clean up and delete all the resources we created, run the cleanup script.

    `node cleanup.js <resourceGroupName> <keyVaultName>`

### understanding what index js does

The sample creates a new key vault, add a key and a secret to the vault, retrieve keys and secrets from it, authorizes an app to use this keyvault's resources.

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

### understanding what weather app js does

The app starts by logging into the azure account, by using your service principal.

We then authenticate with the KeyVault service by using the service principal that was previously authorized 
to interact with the key vault in index.js (see: SP_KEYVAULT_OPERATIONS)

```
// authenticate with key vault with a service principal that we gave access in index.js
var kvCredentials = new KeyVault.KeyVaultCredentials(authenticator);
```

Once authenticated, we fetch the secret's value from the key vault, which would be our API key for openweathermap.org

```
// get the secret's value (api key for openweathermap).
keyVaultClient.getSecret(vaultUri, (err, result) => {...});
```

We then make an http request to openweathermap with the api key and city name and display the weather information.

```
// query openweathermap api and get weather data.
http.get(requestUri, (res) => {...});
```

### understanding what cleanup js does

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

## References and further reading

- [Azure SDK for Node.js](https://github.com/Azure/azure-sdk-for-node)
- [Azure KeyVault Documentation](https://azure.microsoft.com/en-us/documentation/services/key-vault/)
- [Key Vault REST API Reference](https://msdn.microsoft.com/en-us/library/azure/dn903609.aspx)
- [Manage Key Vault using CLI](https://azure.microsoft.com/en-us/documentation/articles/key-vault-manage-with-cli/)
- [Storing and using secrets in Azure](https://blogs.msdn.microsoft.com/dotnet/2016/10/03/storing-and-using-secrets-in-azure/)