export type WebsiteInput = {
  path: string;
  build?: {
    run: string;
    cwd?: string;
    environment?: Record<string, string>;
  };
  region?: string;
  domain?: string | string[];
  certificate?: string;
  security?: {
    allowIframe: boolean;
  };
  redirectToMainDomain?: boolean;
};
