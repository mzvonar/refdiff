// visual-compare manifest for the population-registry design system: Figma file
// M0hnCQJIUho3tcW6PcnHWH vs the DS Storybook (frontend/ds/storybook, :6008 — start recipe in
// docs/handoff-2026-08-27.md "How to run"). Every Figma node here is a COMPONENT_SET, so each
// entry expands into one pair per variant COMPONENT against the story cell its `variants`
// template names. Variants without a story cell are skipped WITH a reason at run time.
//
//   node packages/core/dist/cli.js compare --manifest examples/population-registry-ds.manifest.mjs \
//     --storybook-url http://localhost:6008 --out out/ds [--pair ds-button-fill,ds-alert]

const viewport = { width: 1400, height: 900 };
const fileKey = "M0hnCQJIUho3tcW6PcnHWH";

export const manifest = [
  {
    id: "ds-button-fill",
    title: "DS · Button / Fill",
    // Story cells are tagged (button.stories.tsx `rowSignature`): variant:tone:size:label:icons × state.
    design: {
      kind: "figma",
      fileKey,
      nodeId: "8226:4244",
      variants: {
        selector: '[data-rowkey="fill:{variant|tone}:md:{variant|label}:{iconPlacement|icons}"][data-col="{State}"]',
        maps: {
          tone: { default: "label", success: "success", danger: "danger" },
          label: { default: "Label", success: "Success", danger: "Danger" },
          icons: { none: "", left: "s", right: "e" },
        },
      },
    },
    app: { source: "storybook", storyId: "ds-button--fill", viewport },
  },
  {
    id: "ds-alert",
    title: "DS · Alert",
    // alert.stories.tsx `Default` renders the matrix as ONE column, untagged: per tone
    // (info, success, warning, danger) five rows — left, + close icon, + button, centered,
    // centered + button — then the four compact rows. Positional cells, hence the composite map.
    design: {
      kind: "figma",
      fileKey,
      nodeId: "6765:4792",
      variants: {
        selector: "#storybook-root > div > div.flex-col > :nth-child({Color,Aligned,Type|cell})",
        maps: {
          cell: {
            "Info,Left,Text": "1",
            "Info,Left,Text + Icon": "2",
            "Info,Left,Text + Primary button": "3",
            "Info,Center,Text": "4",
            "Info,Center,Text + Primary button": "5",
            "Success,Left,Text": "6",
            "Success,Left,Text + Icon": "7",
            "Success,Left,Text + Primary button": "8",
            "Success,Center,Text": "9",
            "Success,Center,Text + Primary button": "10",
            "Warning,Left,Text": "11",
            "Warning,Left,Text + Icon": "12",
            "Warning,Left,Text + Primary button": "13",
            "Warning,Center,Text": "14",
            "Warning,Center,Text + Primary button": "15",
            "Error,Left,Text": "16",
            "Error,Left,Text + Icon": "17",
            "Error,Left,Text + Primary button": "18",
            "Error,Center,Text": "19",
            "Error,Center,Text + Primary button": "20",
            "Info,Left,Compact": "21",
            "Success,Left,Compact": "22",
            "Warning,Left,Compact": "23",
            "Error,Left,Compact": "24",
          },
        },
      },
    },
    app: { source: "storybook", storyId: "ds-alert--default", viewport },
  },
  {
    id: "ds-dialog-header",
    title: "DS · Dialog / Header",
    // dialog.stories.tsx `Header`: four panels in a column — Left, Annotation (badge), Subheader
    // center align, Attachment desc. Title+tag, Title+icon, None and Multistep have no panel → skipped.
    design: {
      kind: "figma",
      fileKey,
      nodeId: "21397:2290",
      variants: {
        selector: "#storybook-root > div > div.flex-col > :nth-child({Type,Size|cell})",
        maps: {
          cell: {
            "Left,md": "1",
            "Annotation,md": "2",
            "Subheader center align,lg": "3",
            "Attachment desc,md": "4",
          },
        },
      },
    },
    app: { source: "storybook", storyId: "ds-dialog--header", viewport },
  },
];
