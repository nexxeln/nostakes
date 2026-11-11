export const COUNTED_PATH = "/";

export interface PageAddress {
  readonly origin: string;
  readonly path: string;
  readonly referrer: string;
}

const fromThisSite = ({ origin, referrer }: PageAddress) =>
  URL.canParse(referrer) && new URL(referrer).origin === origin;

export const pageCounterMayLoad = (page: PageAddress) =>
  page.path === COUNTED_PATH && !fromThisSite(page);

export const leavesByLoading = (path: string, counterLoaded: boolean) =>
  counterLoaded && path !== COUNTED_PATH;
