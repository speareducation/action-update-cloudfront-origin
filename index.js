const AWS = require('aws-sdk');
const core = require('@actions/core');
const github = require('@actions/github');
const cloudfront = new AWS.CloudFront();

const sleep = (seconds) => new Promise(resolve => setTimeout(() => resolve(), seconds * 1000));

/**
 * Waits for distribution to deploy
 * Throws an exception if another deployment occurs while we wait.
 * @param {Object} {Id, ETag} 
 * @return true
 * @throws Error
 */
const isDistributionDeployed = async ({ Id, ETag }) => {
    const sleepInterval = 5; // seconds
    let waitTime = 60 * 20; // 20 minute max wait
    while ((waitTime -= sleepInterval) >= 0) {
        await sleep(sleepInterval);
        console.log(new Date().toJSON(), `Checking if distribution is deployed`, { Id, ETag, waitTime });
        const result = await cloudfront.getDistribution({ Id }).promise();
        if (result.ETag !== ETag) {
            throw new Error('Whoops! It looks like someone else deployed while we were waiting for CloudFront to update.');
        }

        if (result.Distribution.Status === 'Deployed') {
            console.log('Distribution deployed!');
            return true;
        }

    }

    throw new Error(`Failed to deploy. Distribution took too long to update.`, { Id, ETag });
}

/**
 * Main handler
 */
const handle = async () => {
    const distributions = JSON.parse(core.getInput('distributions'));
    const originId = core.getInput('originId');
    const project = github.context.repo.repo || null;
    const branch = github.context.ref.replace('refs/heads/', '')
    const environment = branch.split('/')[1] || null;

    if (!distributions[environment]) {
        console.log(`Exiting. No Distribution ID defined for '${environment}'`)
        return;
    }

    // get old configuration
    console.log('Fetching old Distribution')
    const result = await cloudfront.getDistributionConfig({ Id: distributions[environment] }).promise();
    const { ETag, DistributionConfig } = result
    
    // upload configuration with new OriginPath
    // For help with this, see ./example-cloudfront-config.json
    // or use aws-spear cloudfront get-distribution-config --id= "<DIST ID>" | tee
    console.log('Updating Distribution');
    console.log({ originId, project, branch })
    const originIndex = DistributionConfig.Origins.Items.findIndex(item => item.Id === originId);
    if (originIndex !== -1) {
        console.log('Old Origin Path', DistributionConfig.Origins.Items[originIndex].OriginPath);
        DistributionConfig.Origins.Items[originIndex].OriginPath = `/${project}/${branch}`;
        console.log('New Origin Path', DistributionConfig.Origins.Items[originIndex].OriginPath);
    }

    const newConfig = await cloudfront.updateDistribution({
        Id: distributions[environment],
        IfMatch: ETag,
        DistributionConfig,
    }).promise();

    // Wait for distribution to be marked as "Deployed",
    await isDistributionDeployed({ Id: newConfig.Distribution.Id, ETag: newConfig.ETag })

    // invalidate the cache
    console.log('Invalidating Cache')
    await cloudfront.createInvalidation({
        DistributionId: distributions[environment],
        InvalidationBatch: {
            Paths: {
                Quantity: 1, // must match number of entries in "Items"
                Items: ['/*'],
            },
            CallerReference: branch // use release branch as invalidation reference
        }
    }).promise();

    console.log('Done!');

};


try {
    handle().catch(error => core.setFailed(error.message));
} catch (error) {
    console.error(error);
    core.setFailed(error.message);
}