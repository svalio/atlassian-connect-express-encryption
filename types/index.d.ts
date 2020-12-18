import * as express from 'express';
import { EventEmitter } from 'events';
import { FSWatcher } from 'fs';
import { Sequelize } from 'sequelize';
import { request } from 'request';
import OAuth2 from '../lib/internal/oauth2';

type Descriptor = {
    key: string;
    name: string;
    description: string;
    vendor: {
        name: string;
        url: string;
    };
    baseUrl: string;
    links: {
        self: string;
        homepage: string;
    };
    authentication: {
        type: string;
    };
    scopes: string[];
}

type Options = {
    config: {
        descriptorTransformer: (descriptor: Partial<Descriptor>, config: Config) => Descriptor
    }
}

interface ConfigOptions {
    environment: string;
    port: string;
    store: {
        adapter: string,
        type: string
    };
    expressErrorHandling: boolean;
    errorTemplate: boolean;
    validateDescriptor: boolean;
    localBaseUrl: string;
    jwt: {
        validityInMinutes: number;
    };
    product: string;
    hosts: string[];
    maxTokenAge: number;
    userAgent: string;
}

interface Config{
    port(): string
    environment(): string;
    store(): {
        adapter: string,
        type: string
    };
    expressErrorHandling(): boolean;
    errorTemplate(): boolean;
    validateDescriptor(): boolean;
    localBaseUrl(): string;
    jwt(): {
        validityInMinutes: number;
    };
    product(): string;
    hosts(): string[];
    maxTokenAge(): number;
    userAgent(): string;
}

interface StoreAdapter{
    del(key: string, clientKey: string): Promise<void>
    get(key: string, clientKey: string): Promise<any>
    set(key: string, clientKey: string): Promise<any>
}

type MiddlewareParameters = (request: express.Request, response: express.Response, next: express.NextFunction) => void;

declare const DESCRIPTOR_FILENAME = "atlassian-connect.json";

declare interface Store {
    register(adapterKey: string, factory: (logger: Console, opts: any) => StoreAdapter): void;
}

declare class HostClient{
    constructor(addon: AddOn, context: { clientKey: string, useAccountId: string } | Request, clientKey: string);
    addon: AddOn;
    context: boolean
    clientKey: string
    oauth2: OAuth2

    asUser(userKey: string): request
    defaults(): request
    cookie(): request
    jar(): request
}

interface ClientInfo {
    key: string,
    clientKey: string,
    publicKey: string
    sharedSecret: string,
    serverVersion: string,
    pluginsVersion: string,
    baseUrl: string,
    productType: string,
    description: string,
    eventType: string,
    oauthClientId?: string
  }

declare class AddOn extends EventEmitter {
    constructor(app: express.Application, opts?: Options, logger?: Console, callback?: () => void);
    constructor(app: express.Application);
    
    middleware(): MiddlewareParameters;
    authenticate(skipQshVerification: boolean): MiddlewareParameters;
    loadClientInfo(clientKey: string): Promise<ClientInfo>; 
    checkValidToken(): MiddlewareParameters | boolean;

    register() : Promise<void>;
    key: string;
    name: string;
    config: Config;

    app: express.Application;  

    deregister(): Promise<void>;

    descriptor: Descriptor;

    schema: Sequelize;
    settings: StoreAdapter;

    shouldDeregister(): boolean;
    shouldRegister(): boolean;

    validateDescriptor(): {
        type: string;
        message: string;
        validationResults: {
            module: string;
            description: string;
            value?: unknown;
            validValues?: string[];
        }[]
    }[];

    watcher: FSWatcher;

    /** 
     * Reloads AddOn descriptor file
    */
    reloadDescriptor(): void;

    /**
     * @param reqOrOpts either an expressRequest object or options
     * @returns HostClient a httpClient
     */


    httpClient(reqOrOpts: { clientKey: string, useAccountId: string }): HostClient;
    httpClient(reqOrOpts: Request): HostClient;
}
type Opts = {config: ConfigOptions}

type AddOnFactory = (app: express.Application, opts?: Opts, logger?: Console, callback?: () => void) => AddOn;

declare const addOnFactory: AddOnFactory;
export default addOnFactory;