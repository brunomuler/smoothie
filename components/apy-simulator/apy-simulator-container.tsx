"use client";

import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { ApySimulatorContent } from "./apy-simulator";

export interface ApySimulatorContainerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poolId: string;
  poolName: string;
  assetId: string;
  tokenSymbol: string;
  initialData?: {
    totalSupply: number;
    totalBorrow: number;
    supplyApy: number;
    blndApy: number;
  };
}

export function ApySimulatorContainer({
  open,
  onOpenChange,
  poolId,
  poolName,
  assetId,
  tokenSymbol,
  initialData,
}: ApySimulatorContainerProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const title = "APY Simulator";
  const description = `${tokenSymbol} · ${poolName}`;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ApySimulatorContent
            poolId={poolId}
            poolName={poolName}
            assetId={assetId}
            tokenSymbol={tokenSymbol}
            initialData={initialData}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6 overflow-y-auto max-h-[70vh]">
          <ApySimulatorContent
            poolId={poolId}
            poolName={poolName}
            assetId={assetId}
            tokenSymbol={tokenSymbol}
            initialData={initialData}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
