'use client';

// components/editor/collections-panel.tsx
// Panel for managing collections (groups of scene items).
// Allows creating, selecting, and filtering by collections.

import { useState, useCallback, useMemo } from 'react';
import {
  FolderPlus,
  Trash2,
  Circle,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useEditorStore, useSceneStore } from '@/lib/editor/stores';
import { generateId } from '@/lib/editor/utils';
import type { Collection } from '@/lib/editor/schema';

// Predefined collection colors
const COLLECTION_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

interface CollectionItemProps {
  collection: Collection;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function CollectionItem({
  collection,
  isActive,
  onSelect,
  onDelete,
}: CollectionItemProps) {
  // Count members
  const nodes = useSceneStore((s) => s.nodes);
  const memberCount = useMemo(() => {
    let count = 0;
    for (const node of Object.values(nodes)) {
      if (
        'collectionIds' in node &&
        (node as { collectionIds?: string[] }).collectionIds?.includes(
          collection.id,
        )
      ) {
        count++;
      }
    }
    return count;
  }, [nodes, collection.id]);

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-muted/50 text-xs',
        isActive && 'bg-primary/10',
      )}
      onClick={() => onSelect(collection.id)}
    >
      <Circle
        className="size-3 flex-shrink-0"
        fill={collection.color ?? '#888'}
        stroke={collection.color ?? '#888'}
      />
      <span className="flex-1 truncate">
        {collection.name ?? 'Naamloos'}
      </span>
      <span className="text-muted-foreground text-[10px]">
        {memberCount}
      </span>
      {isActive && <Check className="size-3 text-primary flex-shrink-0" />}
      <button
        className="p-0.5 hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(collection.id);
        }}
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

export function CollectionsPanel() {
  const collections = useSceneStore((s) => s.collections);
  const createCollection = useSceneStore((s) => s.createCollection);
  const deleteCollection = useSceneStore((s) => s.deleteCollection);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const selectNode = useEditorStore((s) => s.selectNode);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const nodes = useSceneStore((s) => s.nodes);

  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(
    null,
  );
  const [newName, setNewName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLLECTION_COLORS[0]);

  const collectionList = useMemo(
    () => Object.values(collections),
    [collections],
  );

  const handleCreateCollection = useCallback(() => {
    const name = newName.trim() || 'Nieuwe collectie';
    const collection: Collection = {
      id: generateId(),
      name,
      color: selectedColor,
    };
    createCollection(collection, selectedNodeIds);
    setNewName('');
  }, [newName, selectedColor, selectedNodeIds, createCollection]);

  const handleSelectCollection = useCallback(
    (collectionId: string) => {
      if (activeCollectionId === collectionId) {
        setActiveCollectionId(null);
        clearSelection();
        return;
      }

      setActiveCollectionId(collectionId);
      clearSelection();

      // Select all nodes in this collection
      for (const node of Object.values(nodes)) {
        if (
          'collectionIds' in node &&
          (node as { collectionIds?: string[] }).collectionIds?.includes(
            collectionId,
          )
        ) {
          selectNode(node.id, true);
        }
      }
    },
    [activeCollectionId, nodes, clearSelection, selectNode],
  );

  const handleDeleteCollection = useCallback(
    (collectionId: string) => {
      deleteCollection(collectionId);
      if (activeCollectionId === collectionId) {
        setActiveCollectionId(null);
      }
    },
    [deleteCollection, activeCollectionId],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <FolderPlus className="size-3.5" />
          Collecties
          {collectionList.length > 0 && (
            <span className="text-muted-foreground">
              ({collectionList.length})
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium px-1">Collecties</p>

          {/* Collection list */}
          {collectionList.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-2">
              Geen collecties. Selecteer items en maak een nieuwe collectie.
            </p>
          ) : (
            <div className="space-y-0.5">
              {collectionList.map((collection) => (
                <CollectionItem
                  key={collection.id}
                  collection={collection}
                  isActive={activeCollectionId === collection.id}
                  onSelect={handleSelectCollection}
                  onDelete={handleDeleteCollection}
                />
              ))}
            </div>
          )}

          {/* Create new collection */}
          <div className="border-t border-border pt-2 space-y-2">
            <Input
              placeholder="Collectie naam..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateCollection();
              }}
            />

            {/* Color picker */}
            <div className="flex items-center gap-1 px-1">
              {COLLECTION_COLORS.map((color) => (
                <button
                  key={color}
                  className={cn(
                    'size-5 rounded-full border-2 transition-transform',
                    selectedColor === color
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>

            <Button
              variant="default"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={handleCreateCollection}
              disabled={selectedNodeIds.length === 0}
            >
              <FolderPlus className="size-3 mr-1" />
              {selectedNodeIds.length > 0
                ? `Maak collectie (${selectedNodeIds.length} items)`
                : 'Selecteer eerst items'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
