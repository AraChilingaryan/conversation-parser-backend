import admin, {firestore} from 'firebase-admin';
import {databaseConfig} from '../config/database.config';
import {logger} from '../utils/logger.util';
import type {BaseRepository, FilterOptions, PaginatedQuery, QueryOptions} from '../interfaces/repository.interface';

export abstract class BaseFirestoreRepository<T> implements BaseRepository<T> {
    protected collectionName: string;

    protected constructor(collectionName: string) {
        this.collectionName = collectionName;
    }

    // Add a getter that accesses firestore lazily
    protected get firestore(): firestore.Firestore {
        return databaseConfig.firestore; // This will throw the proper error if not initialized
    }

    /**
     * Create a new document
     */
    async create(data: T): Promise<string> {
        try {
            const docRef = this.firestore.collection(this.collectionName).doc();
            const documentData = this.prepareForStorage(data);

            await docRef.set({
                ...documentData,
                id: docRef.id,
                createdAt: firestore.FieldValue.serverTimestamp(),
                updatedAt: firestore.FieldValue.serverTimestamp(),
            });

            logger.debug(`Created document in ${this.collectionName}:`, docRef.id);
            return docRef.id;
        } catch (error) {
            logger.error(`Error creating document in ${this.collectionName}:`, error);
            throw new Error(`Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create document with specific ID
     */
    async createWithId(id: string, data: T): Promise<void> {
        try {
            const docRef = this.firestore.collection(this.collectionName).doc(id);
            const documentData = this.prepareForStorage(data);

            await docRef.set({
                ...documentData,
                id,
                createdAt: firestore.FieldValue.serverTimestamp(),
                updatedAt: firestore.FieldValue.serverTimestamp(),
            });

            logger.debug(`Created document with ID in ${this.collectionName}:`, id);
        } catch (error) {
            logger.error(`Error creating document with ID in ${this.collectionName}:`, error);
            throw new Error(`Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find document by ID
     */
    async findById(id: string): Promise<T | null> {
        try {
            const docRef = this.firestore.collection(this.collectionName).doc(id);
            const doc = await docRef.get();

            if (!doc.exists) {
                return null;
            }

            const data = doc.data();
            return data ? this.transformFromStorage(data) : null;
        } catch (error) {
            logger.error(`Error finding document by ID in ${this.collectionName}:`, error);
            throw new Error(`Failed to find document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update document
     */
    async update(id: string, data: Partial<T>): Promise<void> {
        try {
            const docRef = this.firestore.collection(this.collectionName).doc(id);
            const updateData = this.prepareForStorage(data as T);

            await docRef.update({
                ...updateData,
                updatedAt: firestore.FieldValue.serverTimestamp(),
            });

            logger.debug(`Updated document in ${this.collectionName}:`, id);
        } catch (error) {
            logger.error(`Error updating document in ${this.collectionName}:`, error);
            throw new Error(`Failed to update document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete document
     */
    async delete(id: string): Promise<void> {
        try {
            const docRef = this.firestore.collection(this.collectionName).doc(id);
            await docRef.delete();

            logger.debug(`Deleted document from ${this.collectionName}:`, id);
        } catch (error) {
            logger.error(`Error deleting document from ${this.collectionName}:`, error);
            throw new Error(`Failed to delete document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if document exists
     */
    async exists(id: string): Promise<boolean> {
        try {
            const docRef = this.firestore.collection(this.collectionName).doc(id);
            const doc = await docRef.get();
            return doc.exists;
        } catch (error) {
            logger.error(`Error checking document existence in ${this.collectionName}:`, error);
            return false;
        }
    }

    /**
     * Find documents with filters
     */
    async findMany(
        filters: FilterOptions = {},
        options: QueryOptions = {}
    ): Promise<PaginatedQuery<T>> {
        try {
            let query: firestore.Query = this.firestore.collection(this.collectionName);

            // Apply filters
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    if (Array.isArray(value)) {
                        query = query.where(key, 'in', value);
                    } else {
                        query = query.where(key, '==', value);
                    }
                }
            })

            // Apply ordering
            if (options.orderBy) {
                query = query.orderBy(options.orderBy, options.orderDirection || 'asc');
            } else {
                query = query.orderBy('createdAt', 'desc');
            }

            // Apply pagination
            if (options.offset) {
                query = query.offset(options.offset);
            }

            if (options.limit) {
                query = query.limit(options.limit + 1); // +1 to check if there's more
            }

            const snapshot = await query.get();
            const docs = snapshot.docs.map(doc => this.transformFromStorage(doc.data()));

            const hasMore = options.limit ? docs.length > options.limit : false;
            if (hasMore && options.limit) {
                docs.pop(); // Remove the extra document
            }

            return {
                data: docs,
                hasMore,
                totalCount: undefined, // We'd need a separate count query for this
            };
        } catch (error) {
            logger.error(`Error finding documents in ${this.collectionName}:`, error);
            throw new Error(`Failed to find documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Count documents with filters
     */
    async count(filters: FilterOptions = {}): Promise<number> {
        try {
            let query: firestore.Query = this.firestore.collection(this.collectionName);

            // Apply filters
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    query = query.where(key, '==', value);
                }
            });

            const snapshot = await query.count().get();
            return snapshot.data().count;
        } catch (error) {
            logger.error(`Error counting documents in ${this.collectionName}:`, error);
            throw new Error(`Failed to count documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Batch operations
     */
    async batchCreate(items: T[]): Promise<string[]> {
        try {
            const batch = this.firestore.batch();
            const ids: string[] = [];

            items.forEach((item) => {
                const docRef = this.firestore.collection(this.collectionName).doc();
                const documentData = this.prepareForStorage(item);

                batch.set(docRef, {
                    ...documentData,
                    id: docRef.id,
                    createdAt: firestore.FieldValue.serverTimestamp(),
                    updatedAt: firestore.FieldValue.serverTimestamp(),
                });

                ids.push(docRef.id);
            });

            await batch.commit();
            logger.debug(`Batch created ${items.length} documents in ${this.collectionName}`);

            return ids;
        } catch (error) {
            logger.error(`Error batch creating documents in ${this.collectionName}:`, error);
            throw new Error(`Failed to batch create documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Search documents (basic text search)
     */
    async search(
        searchTerm: string,
        searchFields: string[],
        options: QueryOptions = {}
    ): Promise<PaginatedQuery<T>> {
        // Note: Firestore doesn't have full-text search built-in
        // This is a basic implementation. For production, consider using Algolia or Elasticsearch
        try {
            let query: firestore.Query = this.firestore.collection(this.collectionName);

            // Apply basic text search (this is limited in Firestore)
            // We'll search for documents where any of the specified fields contain the search term
            const searchResults: T[] = [];

            // Get all documents and filter in memory (not ideal for large datasets)
            const snapshot = await query.get();

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const searchableText = searchFields
                    .map(field => String(data[field] || '').toLowerCase())
                    .join(' ');

                if (searchableText.includes(searchTerm.toLowerCase())) {
                    searchResults.push(this.transformFromStorage(data));
                }
            });

            // Apply sorting and pagination to results
            let sortedResults = searchResults;
            if (options.orderBy) {
                sortedResults.sort((a, b) => {
                    const aVal = (a as any)[options.orderBy!];
                    const bVal = (b as any)[options.orderBy!];
                    return options.orderDirection === 'desc' ?
                        (bVal > aVal ? 1 : -1) :
                        (aVal > bVal ? 1 : -1);
                });
            }

            const offset = options.offset || 0;
            const limit = options.limit || sortedResults.length;
            const paginatedResults = sortedResults.slice(offset, offset + limit);

            return {
                data: paginatedResults,
                hasMore: offset + limit < sortedResults.length,
                totalCount: sortedResults.length,
            };
        } catch (error) {
            logger.error(`Error searching documents in ${this.collectionName}:`, error);
            throw new Error(`Failed to search documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Transform data before storing in Firestore
     * Override in subclasses for custom transformations
     */
    protected prepareForStorage(data: T): Record<string, any> {
        return data as Record<string, any>;
    }

    /**
     * Transform data after retrieving from Firestore
     * Override in subclasses for custom transformations
     */
    protected transformFromStorage(data: Record<string, any>): T {
        // Convert Firestore timestamps to ISO strings
        Object.keys(data).forEach(key => {
            if (data[key] && typeof data[key].toDate === 'function') {
                data[key] = data[key].toDate().toISOString();
            }
        });

        return data as T;
    }
}
