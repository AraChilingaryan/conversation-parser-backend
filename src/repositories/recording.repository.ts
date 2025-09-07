import {BaseFirestoreRepository} from "../repositories/base.repository";
import {Recording} from "../interfaces/user.interface";

export class RecordingRepository extends BaseFirestoreRepository<Recording> {
    // TODO check collection name logic, either recordings would be or users.recordings, research and understand which approach is better
    constructor() {
        super('recordings');
    }

    async createRecording(
        recording: Recording
    ): Promise<void> {
        const timestamp = new Date().toISOString();
        const newRecording: Recording = {
            ...recording,
            id: this.firestore.collection(this.collectionName).doc().id,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        await this.firestore.collection(this.collectionName).doc(newRecording.id).set(newRecording);
        // return newRecording;
    }

}

export const recordingRepository = new RecordingRepository();
