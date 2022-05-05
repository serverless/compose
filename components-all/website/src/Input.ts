export type WebsiteInput = {
  path: string;
  region: string | undefined;
  domain: string | string[] | undefined;
  certificate: string | undefined;
  security: {
    allowIframe: boolean | undefined;
  };
  redirectToMainDomain: boolean | undefined;
};
