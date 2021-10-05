import * as express from 'express';
import { EventEmitter } from 'events';
import { FSWatcher } from 'fs';
import { Sequelize } from 'sequelize';
import { Request, Cookie, CookieJar, RequestCallback, Headers } from 'request';

interface Descriptor {
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

interface Options {
    config: {
        descriptorTransformer?: (descriptor: Partial<Descriptor>, config: Config) => Descriptor
        development?: Partial<ConfigOptions>;
        production?: Partial<ConfigOptions>;
    }
}

interface ConfigOptions {
    environment: string;
    port: string;
    store: {
        adapter?: string,
        type?: string,
        url?: string,
        storage?: string
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
    watch: boolean;
}

interface Config {
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

interface StoreAdapter {
    del(key: string, clientKey: string): Promise<void>;
    get(key: string, clientKey: string): Promise<any>;
    set(key: string, value: any, clientKey: string): Promise<any>;
    getAllClientInfos(): Promise<AddOnFactory.ClientInfo[]>;
}

type MiddlewareParameters = (request: express.Request, response: express.Response, next: express.NextFunction) => void;

declare const DESCRIPTOR_FILENAME = "atlassian-connect.json";

declare interface Store {
    register(adapterKey: string, factory: (logger: Console, opts: any) => StoreAdapter): void;
}

type Stringifiable = string | boolean | number | null | undefined;

type StringifiableRecord = Record<
	string,
	Stringifiable | readonly Stringifiable[]
>;

type JiraPermissionsQuery = {
    project?: string[]
    global?: string[]
};

type ConfluencePermissionsQuery = {
    application?: string[]
    content?: string
};

type Callback = (...arg: any[]) => void;

type ModifyArgsOptions = {
  url: URL|string;
  form?: Record<string, any>;
  urlEncodedFormData?: Record<string, any>;
  qs?: StringifiableRecord;
  headers?: Headers;
  jar?: boolean;
}|URL|string;

type ModifyArgsOutput<
  TOptions extends ModifyArgsOptions,
  TCallback extends Callback
> = TCallback extends Callback
  ? [TOptions, TCallback]
  : [TCallback];

type HostClientArgs<TOptions extends ModifyArgsOptions, TCallback extends Callback> = [
    TOptions, Headers, TCallback, string
];

type BearerToken = {
    access_token: string;
    token_type: string;
    expires_in: number;
};

declare class HostClient {
    constructor(addon: AddOn, context: { clientKey: string, userAccountId?: string } | Request, clientKey: string);
    addon: AddOn;
    context: boolean;
    clientKey: string;
    oauth2: any;
    userKey?: string; // for impersonatingClient

    asUser(userKey: string): HostClient;
    asUserByAccountId: (userAccountId: string|number) => HostClient;
    createJwtPayload: (req: Request) => string;
    getUserBearerToken: (scopes: string[], clientSettings: AddOnFactory.ClientInfo) => Promise<BearerToken>;

    defaults(): Request;
    cookie(): Cookie;
    jar(): CookieJar;

    modifyArgs<TOptions extends ModifyArgsOptions = ModifyArgsOptions, TCallback extends Callback = Callback>(...args: HostClientArgs<TOptions, TCallback>): ModifyArgsOutput<TOptions, TCallback>;

    get: <T = any>(options: any, callback?: RequestCallback) => Promise<T>;
    post: <T = any>(options: any, callback?: RequestCallback) => Promise<T>;
    put: <T = any>(options: any, callback?: RequestCallback) => Promise<T>;
    del: <T = any>(options: any, callback?: RequestCallback) => Promise<T>;
    head: <T = any>(options: any, callback?: RequestCallback) => Promise<T>;
    patch: <T = any>(options: any, callback?: RequestCallback) => Promise<T>;
}

declare class AddOn extends EventEmitter {
    constructor(app: express.Application, opts?: Options, logger?: Console, fileNames?: FileNames, callback?: () => void);
    constructor(app: express.Application);
    
    verifyInstallation(): MiddlewareParameters;
    authenticateInstall(): MiddlewareParameters;
    postInstallation(): (request: express.Request, response: express.Response) => void;
    middleware(): MiddlewareParameters;
    authenticate(skipQshVerification?: boolean): MiddlewareParameters;
    authorizeJira(permissions: JiraPermissionsQuery): MiddlewareParameters;
    authorizeConfluence(permissions: ConfluencePermissionsQuery): MiddlewareParameters;
    loadClientInfo(clientKey: string): Promise<AddOnFactory.ClientInfo>; 
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


    httpClient(reqOrOpts: { clientKey: string, userAccountId?: string }): HostClient;
    httpClient(reqOrOpts: express.Request): HostClient;
}

interface FileNames {
    descriptorFilename?: string;
    configFileName?: string;
}

declare function AddOnFactory(app: express.Application, opts?: Options, logger?: Console, fileNames?: FileNames | Callback, callback?: Callback): AddOn;

declare namespace AddOnFactory {
    export type HostClient = InstanceType<typeof HostClient>;
    export interface ClientInfo {
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
    export type AddOn = InstanceType<typeof AddOn>;
    export type AddOnFactory = typeof AddOnFactory;
    export { BearerToken };
}

export = AddOnFactory;
