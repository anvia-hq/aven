// The server's compose file and env template are embedded in the binary (`with { type: "text" }`).
declare module "*.yml" {
  const text: string;
  export default text;
}
declare module "*.example" {
  const text: string;
  export default text;
}
