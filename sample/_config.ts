import lume from "lume/mod.ts";
import bundle from "../bundle.ts";

const site = lume({
  src: "src",
});

site.use(bundle());
site.add("index.html");

export default site;
