import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { contentItemIdSchema } from "@/lib/validation/content-item";
import { getContentItem } from "@/server/dal/content-items";
import { requireUser } from "@/server/dal/session";
import { accountOptions, savedDeadlines, valuesFromItem } from "../form-data";
import { ItemForm } from "../item-form";
import { DeleteItemButton } from "./delete-item-button";

export const metadata: Metadata = { title: "Detail konten | Montenku" };

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = contentItemIdSchema.safeParse((await params).id);
  // Not found and "belongs to someone else" both 404, so ids cannot be probed.
  const item = id.success ? await getContentItem(user.id, id.data) : null;
  if (!item) notFound();

  const heading = (
    <>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: item.account.color }} />
        {item.account.name}
      </p>
      <h1 className="mt-1 font-heading text-3xl font-bold break-words">{item.title}</h1>
    </>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
      <ItemForm
        itemId={item.id}
        heading={heading}
        initial={valuesFromItem(item)}
        accounts={await accountOptions(user.id, item.accountId)}
        deadlines={savedDeadlines(item)}
        extraAction={<DeleteItemButton itemId={item.id} title={item.title} />}
      />
    </main>
  );
}
