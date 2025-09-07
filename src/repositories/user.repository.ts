import {BaseFirestoreRepository} from "../repositories/base.repository";
import {User} from "../interfaces/user.interface";
import {logger} from "../utils";

export class UserRepository extends BaseFirestoreRepository<User> {
    constructor() {
        super('users');
    }

    async findByPhoneNumber(
        phoneNumber: string
    ): Promise<User | null> {
        try {
            const snapshot = this.firestore.collection(this.collectionName)
                .where('phoneNumber', '==', phoneNumber)
                .limit(1)
                .get();

            // TODO handle properly
            return null;
        } catch (error) {
            logger.error('Error finding user by phone number:', error);
            throw error;
        }
    }

    async findByTwilioNumber(
        phoneNumber: string
    ): Promise<User | null> {
        try {
            const snapshot = this.firestore.collection(this.collectionName)
                .where('phoneNumber', '==', phoneNumber)
                .limit(1)
                .get();

            // TODO handle properly
            return null;
        } catch (error) {
            logger.error('Error finding user by phone number:', error);
            throw error;
        }
    }

}

export const userRepository = new UserRepository();
