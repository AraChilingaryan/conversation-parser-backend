const { SpeechClient } = require('@google-cloud/speech');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

async function testGoogleCloudSetup() {
    console.log('🧪 Testing Google Cloud connection...\n');

    try {
        console.log('📋 Configuration:');
        console.log(`  Project ID: ${process.env.GOOGLE_CLOUD_PROJECT_ID}`);
        console.log(`  Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
        console.log(`  Storage Bucket: ${process.env.FIREBASE_STORAGE_BUCKET}\n`);

        // Test Speech-to-Text API
        console.log('📢 Testing Speech-to-Text API...');
        const speechClient = new SpeechClient();
        const projectId = await speechClient.getProjectId();
        console.log(`✅ Speech-to-Text connected! Project: ${projectId}`);

        // Test Cloud Storage
        console.log('\n💾 Testing Cloud Storage...');
        const storage = new Storage();
        const [buckets] = await storage.getBuckets();
        console.log(`✅ Storage connected! Found ${buckets.length} buckets:`);

        buckets.forEach(bucket => {
            console.log(`   - ${bucket.name}`);
        });

        console.log('\n🎉 All Google Cloud services working perfectly!');
        console.log('🚀 Ready to build conversation parser features!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n🔧 Check:');
        console.log('  1. Service account key file exists');
        console.log('  2. Environment variables are correct');
        console.log('  3. APIs are enabled in Google Cloud Console');
    }
}

testGoogleCloudSetup();
