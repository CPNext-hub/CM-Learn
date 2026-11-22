import SheetViewerClient from "@/components/sheet-viewer/SheetViewerClient";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

export default async function SheetViewerPage({ params }: PageProps) {
    const { id } = await params;

    return <SheetViewerClient sheetId={id} />;
}