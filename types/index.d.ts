import * as express from 'express';
import { EventEmitter } from 'events';
import { FSWatcher } from 'fs';
import { Sequelize } from 'sequelize';
import { request } from 'request';
import OAuth2 from '../lib/internal/oauth2';

// TODO comments
// TODO replace any with types

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
    del(key: string, clientKey: string): Promise<any>
    get(key: string, clientKey: string): Promise<any>
    set(key: string, clientKey: string): Promise<any>
    schema?: Sequelize
    settings: {
        dialect: string;
        logging: boolean
        storage: string
    } | 
    {
        connectionUrl: string;
        collectionName: string;
        databaseName?: string;
        mongoDbOpts: {
            retryWrites: boolean;
            useNewUrlParser: boolean;
            promiseLibrary?: PromiseConstructor
        }
        //opts?!
    }
}

type MiddlewareParameters = (request: express.Request, response: express.Response, next: express.NextFunction) => void;

declare const DESCRIPTOR_FILENAME = "atlassian-connect.json";

declare interface Store {
    register(adapter: any, factory: any): void;
}

declare class HostClient{
    constructor(addon: AddOn, context: { clientKey: string, useAccountId: string } | Request, clientKey: string);
    addon: AddOn;
    //not sure
    context: boolean
    clientKey: string
    oauth2: OAuth2

    //did i import this properly?
    asUser(userKey: string): request
    defaults(): request
    cookie(): request
    jar(): request
}

declare class AddOn extends EventEmitter {
    constructor(app: express.Application, opts?: Options, logger?: Console, callback?: () => void);
    constructor(app: express.Application);
    

    middleware(): MiddlewareParameters;
    authenticate(skipQshVerification: boolean): MiddlewareParameters;
    loadClientInfo(clientKey: string): Promise<any>; // TODO what's the structure of clientInfo
    checkValidToken(): MiddlewareParameters | boolean;

    register() : Promise<any>;
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

    //not sure what im doing here
    //options?
    httpClient(reqOrOpts: { clientKey: string, useAccountId: string }): HostClient;

    //express request
    httpClient(reqOrOpts: Request): HostClient;
}
type Opts = {config: ConfigOptions}

type AddOnFactory = (app: express.Application, opts?: Opts, logger?: Console, callback?: () => void) => AddOn;

declare const addOnFactory: AddOnFactory;
export default addOnFactory;