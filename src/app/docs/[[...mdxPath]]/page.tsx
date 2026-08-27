import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents as getMDXComponents } from "@/mdx-components";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

export async function generateMetadata(props: { params: Promise<{ mdxPath?: string[] }> }) {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  return metadata;
}

// Nextra types `wrapper` as optional (`MDXComponents['wrapper']`) since it's
// meant for a generic MDX consumer that might not define one -- this app's
// own src/mdx-components.tsx always provides one (the `DocsArticle` page
// chrome), so the assertion just tells TypeScript what's already true at
// runtime, same pattern as the `!`-asserted Supabase env vars in
// src/lib/supabase/*.ts.
const Wrapper = getMDXComponents().wrapper!;

export default async function Page(props: { params: Promise<{ mdxPath?: string[] }> }) {
  const params = await props.params;
  const { default: MDXContent, toc, metadata, sourceCode } = await importPage(params.mdxPath);
  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
