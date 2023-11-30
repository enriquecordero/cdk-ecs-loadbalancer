import * as cdk from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Cluster, ContainerImage, CpuArchitecture, FargateService, FargateTaskDefinition, ListenerConfig, LogDriver, OperatingSystemFamily, Protocol } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancer, ApplicationProtocol, IpAddressType, ListenerAction, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { NamespaceType } from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CdkEcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    const vpc = new Vpc(this, 'VPC', {
      maxAzs: 2,
      natGateways: 1,

    })

    // const apiGWEndpoint = vpc.addGatewayEndpoint('apiG',{
    //   service: InterfaceVpcEndpointAwsService.APIGATEWAY,      
    // })


    const albSg = new SecurityGroup(this, "SecurityGroupAlb", {
      vpc: vpc,
      allowAllOutbound: true
    });

    albSg.addIngressRule(Peer.anyIpv4(), Port.tcp(80));

    //albSg.addIngressRule(Peer.anyIpv4(), Port.tcp(443));

    const alb = new ApplicationLoadBalancer(this, "Alb", {
      vpc: vpc,
      internetFacing: true,
      deletionProtection: false,
      ipAddressType: IpAddressType.IPV4,
      securityGroup: albSg,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
    });

    const httplistener = alb.addListener("HttpListener", {
      port: 80,
      open: true,
    });

    httplistener.addAction('Default', {
      action: ListenerAction.fixedResponse(200, {
        messageBody: "no Route defined"
      })
    })



    const cluster = new Cluster(this, 'Cluster', {
      clusterName: 'Services',
      vpc: vpc,
      containerInsights: true,

    })

    cluster.addDefaultCloudMapNamespace({
      name: 'exaple.com',
      type: NamespaceType.DNS_PRIVATE,
      vpc: vpc
    })



    //Creating the ECS task definition
    const taskDefinition = new FargateTaskDefinition(this, `exaple-TaskDefinition`, {
      memoryLimitMiB: 512,
      cpu: 256,
      family: "webapp",
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.ARM64,
      }
    });


    //Creating the container definition
    const name: string = 'phpimages'
    //Log Groups
    const containerLogs = new LogGroup(this, "ContainerGroup", {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,

    })

    const containerDefinition = taskDefinition.addContainer(`${name}-Container`, {
      image: ContainerImage.fromEcrRepository(Repository.fromRepositoryName(this, `${name}-ECR-Image`, name)),
      logging: LogDriver.awsLogs({
        streamPrefix: `${name}-Logs`,
        logGroup: containerLogs,

      }),
      // healthCheck: {
      //   command: [
      //     'CMD-SHELL,curl -f http://localhost/ || exit 1'
      //   ],
      //   interval: cdk.Duration.seconds(30),
      //   timeout: cdk.Duration.seconds(10),
      //   startPeriod: cdk.Duration.seconds(300),
      //   retries: 3,
      // },
      portMappings: [{
        containerPort: 80,
        protocol: Protocol.TCP
      }]
    });

    const sg = new SecurityGroup(this, `${id}-security-group`, {
      description: `Security group for service `,
      vpc: cluster.vpc,
    });
    sg.addIngressRule(Peer.anyIpv4(), Port.tcp(80));

    const service = new FargateService(this, id, {
      cluster,
      taskDefinition,
      desiredCount: 2,
      serviceName: "php-srv",
      securityGroups: [sg],
      circuitBreaker: {
        rollback: true,
      },
      assignPublicIp: true
    });

    service.registerLoadBalancerTargets({
      containerName: containerDefinition.containerName,
      newTargetGroupId: `${name}-TargetGroup`,
      listener: ListenerConfig.applicationListener(httplistener, {
        protocol: ApplicationProtocol.HTTP,
        conditions: [
          ListenerCondition.pathPatterns(["/*"])
        ],
        healthCheck: {
          path: '/'
        },
        priority:1
      })
    })




  }
}
