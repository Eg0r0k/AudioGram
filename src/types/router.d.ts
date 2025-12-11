import "vue-router";
declare module "vue-router" {
  interface RouteMeta {
    title?: string;
    titleKey?: string;
    layout?: string;
    icon?: string;
    showInNav?: boolean;
    showInMobileNav?: boolean;
    navOrder?: number;
    // TODO: Implement that
    keepAlive?: boolean;
  }
}
