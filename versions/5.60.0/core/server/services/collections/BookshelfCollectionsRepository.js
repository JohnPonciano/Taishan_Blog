const logger = require('@tryghost/logging');
const Collection = require('@tryghost/collections').Collection;
const sentry = require('../../../shared/sentry');
/**
 * @typedef {import('@tryghost/collections/src/CollectionRepository')} CollectionRepository
 */

/**
 * @implements {CollectionRepository}
 */
module.exports = class BookshelfCollectionsRepository {
    #model;
    constructor(model) {
        this.#model = model;
    }

    async createTransaction(cb) {
        return this.#model.transaction(cb);
    }

    /**
     * @param {string} id
     * @returns {Promise<Collection>}
     */
    async getById(id, options = {}) {
        const model = await this.#model.findOne({id}, {
            require: false,
            withRelated: ['collectionPosts'],
            transacting: options.transaction
        });
        if (!model) {
            return null;
        }
        return this.#modelToCollection(model);
    }

    /**
     * @param {string} slug
     * @returns {Promise<Collection>}
     */
    async getBySlug(slug, options = {}) {
        const model = await this.#model.findOne({slug}, {
            require: false,
            withRelated: ['collectionPosts'],
            transacting: options.transaction
        });
        if (!model) {
            return null;
        }
        return this.#modelToCollection(model);
    }

    /**
     * @param {object} [options]
     * @param {string} [options.filter]
     * @param {string} [options.order]
     * @param {import('knex').Transaction} [options.transaction]
     */
    async getAll(options = {}) {
        const models = await this.#model.findAll({
            ...options,
            transacting: options.transaction,
            withRelated: ['collectionPosts']
        });

        return (await Promise.all(models.map(model => this.#modelToCollection(model)))).filter(entity => !!entity);
    }

    async #modelToCollection(model) {
        const json = model.toJSON();
        let filter = json.filter;

        if (json.type === 'automatic' && typeof filter !== 'string') {
            filter = '';
        }

        try {
            return await Collection.create({
                id: json.id,
                slug: json.slug,
                title: json.title,
                description: json.description,
                filter: filter,
                type: json.type,
                featureImage: json.feature_image,
                posts: json.collectionPosts.map(collectionPost => collectionPost.post_id),
                createdAt: json.created_at,
                updatedAt: json.updated_at
            });
        } catch (err) {
            logger.error(err);
            sentry.captureException(err);
            return null;
        }
    }

    /**
     * @param {Collection} collection
     * @param {object} [options]
     * @param {import('knex').Transaction} [options.transaction]
     * @returns {Promise<void>}
     */
    async save(collection, options = {}) {
        if (collection.deleted) {
            await this.#model.destroy({id: collection.id});
            return;
        }
        const data = {
            id: collection.id,
            slug: collection.slug,
            title: collection.title,
            description: collection.description,
            filter: collection.filter,
            type: collection.type,
            feature_image: collection.featureImage || null,
            posts: collection.posts.map(postId => ({id: postId})),
            created_at: collection.createdAt,
            updated_at: collection.updatedAt
        };

        const existing = await this.#model.findOne(
            {id: data.id},
            {
                require: false,
                transacting: options.transaction
            }
        );

        if (!existing) {
            await this.#model.add(data, {
                transacting: options.transaction
            });
        } else {
            return this.#model.edit(data, {
                id: data.id,
                transacting: options.transaction
            });
        }
    }
};
