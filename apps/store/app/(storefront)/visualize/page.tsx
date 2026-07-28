import Vton2D from "../../../components/vton/vton-2d";
import { redirect } from "next/navigation";
import { getCustomerFromCookies } from "../../lib/auth";

export const metadata = {
    title: "Virtual Try-On | Manikan Studio",
    description: "Mix and match clothing items using AI-powered 2D try-on synthesis.",
};

interface PageProps {
    searchParams: Promise<{ productId?: string }>;
}

export default async function VisualizePage({
    searchParams,
}: PageProps) {
    const customer = await getCustomerFromCookies();
    if (!customer) {
        redirect("/login");
    }

    const resolvedParams = await searchParams;
    return <Vton2D initialSelectedGarmentId={resolvedParams?.productId} />;
}
