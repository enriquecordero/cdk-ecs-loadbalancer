#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkEcsStack } from '../lib/cdk-ecs-stack';

const app = new cdk.App();
new CdkEcsStack(app, 'CdkEcsStack', {
   env: { account: '052812841264', region: 'us-east-1' },
});